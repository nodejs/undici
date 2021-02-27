'use strict'

const { test } = require('tap')
const { Client } = require('..')
const { createServer } = require('http')
const { createHook, executionAsyncId } = require('async_hooks')
const { readFile } = require('fs')
const { PassThrough } = require('stream')

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

test('async hooks', (t) => {
  t.plan(31)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    readFile(__filename, (err, buf) => {
      t.error(err)
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
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
      t.error(err)
      body.resume()
      t.strictDeepEqual(getCurrentTransaction(), null)

      setCurrentTransaction({ hello: 'world2' })

      client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
        t.error(err)
        t.strictDeepEqual(getCurrentTransaction(), { hello: 'world2' })

        body.once('data', () => {
          t.pass()
          body.resume()
        })

        body.on('end', () => {
          t.pass()
        })
      })
    })

    client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
      t.error(err)
      body.resume()
      t.strictDeepEqual(getCurrentTransaction(), null)

      setCurrentTransaction({ hello: 'world' })

      client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
        t.error(err)
        t.strictDeepEqual(getCurrentTransaction(), { hello: 'world' })

        body.once('data', () => {
          t.pass()
          body.resume()
        })

        body.on('end', () => {
          t.pass()
        })
      })
    })

    client.request({ path: '/', method: 'HEAD' }, (err, { statusCode, headers, body }) => {
      t.error(err)
      body.resume()
      t.strictDeepEqual(getCurrentTransaction(), null)

      setCurrentTransaction({ hello: 'world' })

      client.request({ path: '/', method: 'HEAD' }, (err, { statusCode, headers, body }) => {
        t.error(err)
        t.strictDeepEqual(getCurrentTransaction(), { hello: 'world' })

        body.once('data', () => {
          t.pass()
          body.resume()
        })

        body.on('end', () => {
          t.pass()
        })
      })
    })

    client.stream({ path: '/', method: 'GET' }, () => {
      t.strictDeepEqual(getCurrentTransaction(), null)
      return new PassThrough().resume()
    }, (err) => {
      t.error(err)
      t.strictDeepEqual(getCurrentTransaction(), null)

      setCurrentTransaction({ hello: 'world' })

      client.stream({ path: '/', method: 'GET' }, () => {
        t.strictDeepEqual(getCurrentTransaction(), { hello: 'world' })
        return new PassThrough().resume()
      }, (err) => {
        t.error(err)
        t.strictDeepEqual(getCurrentTransaction(), { hello: 'world' })
      })
    })
  })
})

test('async hooks client is destroyed', (t) => {
  t.plan(7)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    readFile(__filename, (err, buf) => {
      t.error(err)
      res.write('asd')
    })
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, { body }) => {
      t.error(err)
      body.resume()
      body.on('error', (err) => {
        t.ok(err)
      })
      t.strictDeepEqual(getCurrentTransaction(), null)

      setCurrentTransaction({ hello: 'world2' })

      client.request({ path: '/', method: 'GET' }, (err) => {
        t.strictEqual(err.message, 'The client is destroyed')
        t.strictDeepEqual(getCurrentTransaction(), { hello: 'world2' })
      })
      client.destroy((err) => {
        t.error(err)
      })
    })
  })
})

test('async hooks pipeline handler', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    setCurrentTransaction({ hello: 'world2' })

    client
      .pipeline({ path: '/', method: 'GET' }, ({ body }) => {
        t.strictDeepEqual(getCurrentTransaction(), { hello: 'world2' })
        return body
      })
      .on('close', () => {
        t.pass()
      })
      .resume()
      .end()
  })
})
