'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { ok, deepStrictEqual, strictEqual } = require('node:assert')
const { test, after, describe } = require('node:test')
const { once } = require('node:events')
const { Client } = require('..')
const { createServer } = require('node:http')
const { Readable } = require('node:stream')
const { wrapWithAsyncIterable } = require('./utils/async-iterators')

describe('strictContentLength: false', () => {
  const emitWarningOriginal = process.emitWarning
  let emitWarningCalled = false
  let emitWarningCount = 0

  process.emitWarning = function () {
    emitWarningCalled = true
    emitWarningCount++
  }

  function assertEmitWarningCalledAndReset () {
    ok(emitWarningCalled)
    emitWarningCalled = false
  }

  after(() => {
    process.emitWarning = emitWarningOriginal
  })

  test('request invalid content-length', async (t) => {
    t = tspl(t, { plan: 8 })

    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.end()
    })
    after(() => {
      server.closeAllConnections?.()
      server.close()
    })

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, {
        strictContentLength: false
      })
      after(() => client.close())

      client.request({
        path: '/',
        method: 'PUT',
        headers: {
          'content-length': 10
        },
        body: 'asd'
      }, (err, data) => {
        assertEmitWarningCalledAndReset()
        t.ifError(err)
      })

      client.request({
        path: '/',
        method: 'PUT',
        headers: {
          'content-length': 10
        },
        body: 'asdasdasdasdasdasda'
      }, (err, data) => {
        assertEmitWarningCalledAndReset()
        t.ifError(err)
      })

      client.request({
        path: '/',
        method: 'PUT',
        headers: {
          'content-length': 10
        },
        body: Buffer.alloc(9)
      }, (err, data) => {
        assertEmitWarningCalledAndReset()
        t.ifError(err)
      })

      client.request({
        path: '/',
        method: 'PUT',
        headers: {
          'content-length': 10
        },
        body: Buffer.alloc(11)
      }, (err, data) => {
        assertEmitWarningCalledAndReset()
        t.ifError(err)
      })

      client.request({
        path: '/',
        method: 'HEAD',
        headers: {
          'content-length': 10
        }
      }, (err, data) => {
        t.ifError(err)
      })

      client.request({
        path: '/',
        method: 'GET',
        headers: {
          'content-length': 0
        }
      }, (err, data) => {
        t.ifError(err)
      })

      client.request({
        path: '/',
        method: 'GET',
        headers: {
          'content-length': 4
        },
        body: new Readable({
          read () {
            this.push('asd')
            this.push(null)
          }
        })
      }, (err, data) => {
        t.ifError(err)
      })

      client.request({
        path: '/',
        method: 'GET',
        headers: {
          'content-length': 4
        },
        body: new Readable({
          read () {
            this.push('asasdasdasdd')
            this.push(null)
          }
        })
      }, (err, data) => {
        t.ifError(err)
      })
    })

    await t.completed
  })

  test('request streaming content-length less than body size', async (t) => {
    t = tspl(t, { plan: 2 })

    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.end()
    })
    after(() => {
      server.closeAllConnections?.()
      server.close()
    })

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, {
        strictContentLength: false
      })
      after(() => client.close())

      // The body doesn't end where the server expects, so the connection
      // must be closed rather than reused.
      client.on('disconnect', () => {
        t.ok(true, 'connection closed after the length mismatch')
      })

      client.request({
        path: '/',
        method: 'PUT',
        headers: {
          'content-length': 2
        },
        body: new Readable({
          read () {
            setImmediate(() => {
              this.push('abcd')
              this.push(null)
            })
          }
        })
      }, (err) => {
        assertEmitWarningCalledAndReset()
        t.ifError(err)
      })
    })

    await t.completed
  })

  test('request streaming content-length greater than body size', async (t) => {
    t = tspl(t, { plan: 2 })

    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.end()
    })
    after(() => {
      server.closeAllConnections?.()
      server.close()
    })

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, {
        strictContentLength: false
      })
      after(() => client.close())

      // The body doesn't end where the server expects, so the connection
      // must be closed rather than reused.
      client.on('disconnect', () => {
        t.ok(true, 'connection closed after the length mismatch')
      })

      client.request({
        path: '/',
        method: 'PUT',
        headers: {
          'content-length': 10
        },
        body: new Readable({
          read () {
            setImmediate(() => {
              this.push('abcd')
              this.push(null)
            })
          }
        })
      }, (err) => {
        assertEmitWarningCalledAndReset()
        t.ifError(err)
      })
    })

    await t.completed
  })

  test('request streaming data when content-length=0', async (t) => {
    t = tspl(t, { plan: 2 })

    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.end()
    })
    after(() => {
      server.closeAllConnections?.()
      server.close()
    })

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, {
        strictContentLength: false
      })
      after(() => client.close())

      // The body doesn't end where the server expects, so the connection
      // must be closed rather than reused.
      client.on('disconnect', () => {
        t.ok(true, 'connection closed after the length mismatch')
      })

      client.request({
        path: '/',
        method: 'PUT',
        headers: {
          'content-length': 0
        },
        body: new Readable({
          read () {
            setImmediate(() => {
              this.push('asdasdasdkajsdnasdkjasnd')
              this.push(null)
            })
          }
        })
      }, (err) => {
        assertEmitWarningCalledAndReset()
        t.ifError(err)
      })
    })

    await t.completed
  })

  test('request async iterating content-length less than body size', async (t) => {
    t = tspl(t, { plan: 2 })

    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.end()
    })
    after(() => {
      server.closeAllConnections?.()
      server.close()
    })

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, {
        strictContentLength: false
      })
      after(() => client.close())

      // The body doesn't end where the server expects, so the connection
      // must be closed rather than reused.
      client.on('disconnect', () => {
        t.ok(true, 'connection closed after the length mismatch')
      })

      client.request({
        path: '/',
        method: 'PUT',
        headers: {
          'content-length': 2
        },
        body: wrapWithAsyncIterable(new Readable({
          read () {
            setImmediate(() => {
              this.push('abcd')
              this.push(null)
            })
          }
        }))
      }, (err) => {
        assertEmitWarningCalledAndReset()
        t.ifError(err)
      })
    })

    await t.completed
  })

  test('request async iterator content-length greater than body size', async (t) => {
    t = tspl(t, { plan: 2 })

    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.end()
    })
    after(() => {
      server.closeAllConnections?.()
      server.close()
    })

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, {
        strictContentLength: false
      })
      after(() => client.close())

      // The body doesn't end where the server expects, so the connection
      // must be closed rather than reused.
      client.on('disconnect', () => {
        t.ok(true, 'connection closed after the length mismatch')
      })

      client.request({
        path: '/',
        method: 'PUT',
        headers: {
          'content-length': 10
        },
        body: wrapWithAsyncIterable(new Readable({
          read () {
            setImmediate(() => {
              this.push('abcd')
              this.push(null)
            })
          }
        }))
      }, (err) => {
        assertEmitWarningCalledAndReset()
        t.ifError(err)
      })
    })
    await t.completed
  })

  test('request async iterator data when content-length=0', async (t) => {
    t = tspl(t, { plan: 2 })

    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.end()
    })
    after(() => {
      server.closeAllConnections?.()
      server.close()
    })

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, {
        strictContentLength: false
      })
      after(() => client.close())

      // The body doesn't end where the server expects, so the connection
      // must be closed rather than reused.
      client.on('disconnect', () => {
        t.ok(true, 'connection closed after the length mismatch')
      })

      client.request({
        path: '/',
        method: 'PUT',
        headers: {
          'content-length': 0
        },
        body: wrapWithAsyncIterable(new Readable({
          read () {
            setImmediate(() => {
              this.push('asdasdasdkajsdnasdkjasnd')
              this.push(null)
            })
          }
        }))
      }, (err) => {
        assertEmitWarningCalledAndReset()
        t.ifError(err)
      })
    })
    await t.completed
  })

  // The server reads exactly content-length bytes of body and parses whatever
  // follows as the next request. Bytes past the declared length must not be
  // sent, or a body could smuggle in a request of its own.
  for (const [kind, wrap] of [['stream', (body) => body], ['async iterable', wrapWithAsyncIterable]]) {
    test(`request ${kind} bytes past content-length are not sent`, async () => {
      const seen = []
      let connections = 0
      const server = createServer((req, res) => {
        let body = ''
        req.setEncoding('latin1')
        req.on('data', (chunk) => { body += chunk })
        req.on('end', () => {
          seen.push(`${req.method} ${req.url} ${JSON.stringify(body)}`)
          res.end()
        })
      })
      server.on('connection', () => { connections++ })
      after(() => {
        server.closeAllConnections?.()
        server.close()
      })
      await once(server.listen(0), 'listening')

      const client = new Client(`http://localhost:${server.address().port}`, {
        strictContentLength: false
      })
      after(() => client.close())

      emitWarningCount = 0
      const upload = await client.request({
        path: '/upload',
        method: 'POST',
        headers: { 'content-length': 5 },
        body: wrap(Readable.from(['hello', 'GET /smuggled HTTP/1.1\r\nhost: x\r\n\r\n', 'more']))
      })
      await upload.body.dump()

      const next = await client.request({ path: '/next', method: 'GET' })
      await next.body.dump()

      deepStrictEqual(seen, ['POST /upload "hello"', 'GET /next ""'])
      strictEqual(connections, 2, 'the connection is not reused after the mismatch')
      strictEqual(emitWarningCount, 1, 'one warning per request, not per chunk')
      emitWarningCalled = false
    })
  }

  // A body shorter than declared leaves the server waiting for the rest. A
  // request pipelined behind it on the same connection must not be read as
  // the missing bytes.
  test('request stream shorter than content-length is not completed by the next request', async () => {
    const seen = []
    let postBody
    const postClosed = new Promise((resolve) => { postBody = resolve })
    const server = createServer((req, res) => {
      seen.push(`${req.method} ${req.url}`)
      let body = ''
      req.setEncoding('latin1')
      req.on('data', (chunk) => { body += chunk })
      if (req.method === 'POST') {
        // The request object doesn't emit 'close' for an unfinished body once
        // the response is sent, so wait for its connection to close.
        req.socket.on('close', () => postBody(body))
      }
      // Respond without waiting for the body, as a server rejecting it would.
      res.end()
    })
    after(() => {
      server.closeAllConnections?.()
      server.close()
    })
    await once(server.listen(0), 'listening')

    const client = new Client(`http://localhost:${server.address().port}`, {
      strictContentLength: false,
      pipelining: 2
    })
    after(() => client.close())

    emitWarningCount = 0
    // blocking: false lets the GET be pipelined as soon as the body is written.
    const [upload, next] = await Promise.all([
      client.request({
        path: '/upload',
        method: 'POST',
        headers: { 'content-length': 5 },
        body: Readable.from(['hel']),
        blocking: false
      }),
      client.request({ path: '/next', method: 'GET' })
    ])
    await upload.body.dump()
    await next.body.dump()

    const body = await postClosed
    ok('hel'.startsWith(body), `POST body must only contain its own bytes, got ${JSON.stringify(body)}`)
    deepStrictEqual(seen, ['POST /upload', 'GET /next'])
    strictEqual(emitWarningCount, 1)
    emitWarningCalled = false
  })
})
