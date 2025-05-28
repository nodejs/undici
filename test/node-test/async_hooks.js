'use strict'

const { test } = require('node:test')
const { Client } = require('../..')
const { createServer } = require('node:http')
const { createHook, executionAsyncId } = require('node:async_hooks')
const { readFile } = require('node:fs')
const { PassThrough } = require('node:stream')
const { tspl } = require('@matteo.collina/tspl')
const { closeServerAsPromise } = require('../utils/node-http')

const transactions = new Map()

function getCurrentTransaction () {
  const asyncId = executionAsyncId()
  return transactions.has(asyncId) ? transactions.get(asyncId) : null
}

function setCurrentTransaction (trans) {
  const asyncId = executionAsyncId()
  transactions.set(asyncId, trans)
}

const hook = createHook({
  init (asyncId, type, triggerAsyncId, resource) {
    if (type === 'TIMERWRAP') return
    // process._rawDebug(type + ' ' + asyncId)
    transactions.set(asyncId, getCurrentTransaction())
  },
  destroy (asyncId) {
    transactions.delete(asyncId)
  }
})

hook.enable()

test('async hooks', async (t) => {
  const p = tspl(t, { plan: 31 })

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    readFile(__filename, (err, buf) => {
      p.ifError(err)
      const buf1 = buf.slice(0, buf.length / 2)
      const buf2 = buf.slice(buf.length / 2)
      // we split the file so that it's received in 2 chunks
      // and it should restore the state on the second
      res.write(buf1)
      setTimeout(() => {
        res.end(buf2)
      }, 10)
    })
  })
  t.after(() => server.close.bind(server)())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(() => client.destroy.bind(client)())

    client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
      p.ifError(err)
      body.resume()
      p.deepStrictEqual(getCurrentTransaction(), null)

      setCurrentTransaction({ hello: 'world2' })

      client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
        p.ifError(err)
        p.deepStrictEqual(getCurrentTransaction(), { hello: 'world2' })

        body.once('data', () => {
          p.ok(1, 1)
          body.resume()
        })

        body.on('end', () => {
          p.ok(1, 1)
        })
      })
    })

    client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
      p.ifError(err)
      body.resume()
      p.deepStrictEqual(getCurrentTransaction(), null)

      setCurrentTransaction({ hello: 'world' })

      client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
        p.ifError(err)
        p.deepStrictEqual(getCurrentTransaction(), { hello: 'world' })

        body.once('data', () => {
          p.ok(1)
          body.resume()
        })

        body.on('end', () => {
          p.ok(1)
        })
      })
    })

    client.request({ path: '/', method: 'HEAD' }, (err, { statusCode, headers, body }) => {
      p.ifError(err)
      body.resume()
      p.deepStrictEqual(getCurrentTransaction(), null)

      setCurrentTransaction({ hello: 'world' })

      client.request({ path: '/', method: 'HEAD' }, (err, { statusCode, headers, body }) => {
        p.ifError(err)
        p.deepStrictEqual(getCurrentTransaction(), { hello: 'world' })

        body.once('data', () => {
          p.ok(1)
          body.resume()
        })

        body.on('end', () => {
          p.ok(1)
        })
      })
    })

    client.stream({ path: '/', method: 'GET' }, () => {
      p.strictEqual(getCurrentTransaction(), null)
      return new PassThrough().resume()
    }, (err) => {
      p.ifError(err)
      p.deepStrictEqual(getCurrentTransaction(), null)

      setCurrentTransaction({ hello: 'world' })

      client.stream({ path: '/', method: 'GET' }, () => {
        p.deepStrictEqual(getCurrentTransaction(), { hello: 'world' })
        return new PassThrough().resume()
      }, (err) => {
        p.ifError(err)
        p.deepStrictEqual(getCurrentTransaction(), { hello: 'world' })
      })
    })
  })

  await p.completed
})

test('async hooks client is destroyed', async (t) => {
  const p = tspl(t, { plan: 7 })

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    readFile(__filename, (err, buf) => {
      p.ifError(err)
      res.write('asd')
    })
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, { body }) => {
      p.ifError(err)
      body.resume()
      body.on('error', (err) => {
        p.ok(err)
      })
      p.deepStrictEqual(getCurrentTransaction(), null)

      setCurrentTransaction({ hello: 'world2' })

      client.request({ path: '/', method: 'GET' }, (err) => {
        p.strictEqual(err.message, 'The client is destroyed')
        p.deepStrictEqual(getCurrentTransaction(), { hello: 'world2' })
      })
      client.destroy((err) => {
        p.ifError(err)
      })
    })
  })

  await p.completed
})

test('async hooks pipeline handler', async (t) => {
  const p = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    res.end('hello')
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(() => { return client.close() })

    setCurrentTransaction({ hello: 'world2' })

    client
      .pipeline({ path: '/', method: 'GET' }, ({ body }) => {
        p.deepStrictEqual(getCurrentTransaction(), { hello: 'world2' })
        return body
      })
      .on('close', () => {
        p.ok(1)
      })
      .resume()
      .end()
  })

  await p.completed
})
