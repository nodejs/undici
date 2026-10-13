'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after, describe } = require('node:test')
const { once } = require('node:events')
const { Client, H2CClient, errors } = require('..')
const { createServer } = require('node:http')
const { createServer: createH2CServer } = require('node:http2')

describe('max response size', async (t) => {
  test('default max default size should allow all responses', async (t) => {
    t = tspl(t, { plan: 3 })

    const server = createServer({ joinDuplicateHeaders: true })
    after(() => {
      server.closeAllConnections?.()
      server.close()
    })

    server.on('request', (req, res) => {
      res.end('hello')
    })

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, { maxResponseSize: -1 })
      after(() => client.close())

      client.on('disconnect', () => {
        if (!client.closed && !client.destroyed) {
          t.fail('unexpected disconnect')
        }
      })

      client.request({ path: '/', method: 'GET' }, (err, { statusCode, body }) => {
        t.ifError(err)
        t.strictEqual(statusCode, 200)
        const bufs = []
        body.on('data', (buf) => {
          bufs.push(buf)
        })
        body.on('end', () => {
          t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
        })
      })
    })

    await t.completed
  })

  test('max response size set to zero should allow only empty responses', async (t) => {
    t = tspl(t, { plan: 3 })

    const server = createServer({ joinDuplicateHeaders: true })
    after(() => {
      server.closeAllConnections?.()
      server.close()
    })

    server.on('request', (req, res) => {
      res.end()
    })

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, { maxResponseSize: 0 })
      after(() => client.close())

      client.on('disconnect', () => {
        if (!client.closed && !client.destroyed) {
          t.fail('unexpected disconnect')
        }
      })

      client.request({ path: '/', method: 'GET' }, (err, { statusCode, body }) => {
        t.ifError(err)
        t.strictEqual(statusCode, 200)
        const bufs = []
        body.on('data', (buf) => {
          bufs.push(buf)
        })
        body.on('end', () => {
          t.strictEqual('', Buffer.concat(bufs).toString('utf8'))
        })
      })
    })

    await t.completed
  })

  test('should throw an error if the response is too big', async (t) => {
    t = tspl(t, { plan: 3 })

    const server = createServer({ joinDuplicateHeaders: true })
    after(() => {
      server.closeAllConnections?.()
      server.close()
    })

    server.on('request', (req, res) => {
      res.end('hello')
    })

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, {
        maxResponseSize: 1
      })

      after(() => client.close())

      client.request({ path: '/', method: 'GET' }, (err, { body }) => {
        t.ifError(err)
        body.on('error', (err) => {
          t.ok(err)
          t.ok(err instanceof errors.ResponseExceededMaxSizeError)
        })
      })
    })

    await t.completed
  })

  test('should throw an error if the response is too big over h2c', async (t) => {
    t = tspl(t, { plan: 1 })

    const server = createH2CServer()
    after(() => {
      server.close()
    })

    server.on('stream', (stream) => {
      // the client resets the stream once the limit is passed
      stream.on('error', () => {})
      stream.respond({ ':status': 200 })
      stream.end('hello')
    })

    server.listen(0)
    await once(server, 'listening')

    const client = new H2CClient(`http://localhost:${server.address().port}`, {
      maxResponseSize: 1
    })
    after(() => client.destroy())

    let error = null
    try {
      const { body } = await client.request({ path: '/', method: 'GET' })
      await body.text()
    } catch (err) {
      error = err
    }

    t.ok(error instanceof errors.ResponseExceededMaxSizeError)

    await t.completed
  })

  test('should keep the h2c session usable after a stream exceeds the limit', async (t) => {
    t = tspl(t, { plan: 3 })

    let connections = 0
    const server = createH2CServer()
    after(() => {
      server.close()
    })

    server.on('connection', () => {
      connections++
    })
    server.on('stream', (stream, headers) => {
      stream.on('error', () => {})
      stream.respond({ ':status': 200 })
      stream.end(headers[':path'] === '/big' ? 'hello world' : 'ok')
    })

    server.listen(0)
    await once(server, 'listening')

    const client = new H2CClient(`http://localhost:${server.address().port}`, {
      maxResponseSize: 2
    })
    after(() => client.destroy())

    let error = null
    try {
      const { body } = await client.request({ path: '/big', method: 'GET' })
      await body.text()
    } catch (err) {
      error = err
    }

    t.ok(error instanceof errors.ResponseExceededMaxSizeError)

    const { body } = await client.request({ path: '/small', method: 'GET' })
    t.strictEqual(await body.text(), 'ok')
    t.strictEqual(connections, 1)

    await t.completed
  })

  test('invalid max response size should throw an error', async (t) => {
    t = tspl(t, { plan: 2 })

    t.throws(() => {
      // eslint-disable-next-line no-new
      new Client('http://localhost:3000', { maxResponseSize: 'hello' })
    }, 'maxResponseSize must be a number')
    t.throws(() => {
      // eslint-disable-next-line no-new
      new Client('http://localhost:3000', { maxResponseSize: -2 })
    }, 'maxResponseSize must be greater than or equal to -1')
  })

  await t.completed
})
