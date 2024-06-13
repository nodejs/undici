'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after, describe } = require('node:test')
const { Client, errors } = require('..')
const { createServer } = require('node:http')

describe('max response size', async (t) => {
  test('default max default size should allow all responses', async (t) => {
    t = tspl(t, { plan: 3 })

    const server = createServer()
    after(() => server.close())

    server.on('request', (req, res) => {
      res.end('hello')
    })

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, { maxResponseSize: -1 })
      after(() => client.close())

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

    const server = createServer()
    after(() => server.close())

    server.on('request', (req, res) => {
      res.end()
    })

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, { maxResponseSize: 0 })
      after(() => client.close())

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

    const server = createServer()
    after(() => server.close())

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
