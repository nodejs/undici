'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const https = require('node:https')
const { Client, Pool, errors } = require('../..')
const stream = require('node:stream')
const { createSecureServer } = require('node:http2')
const pem = require('@metcoder95/https-pem')
const { tspl } = require('@matteo.collina/tspl')
const { closeServerAsPromise, closeClientAndServerAsPromise } = require('../utils/node-http')

test('dispatch invalid opts', (t) => {
  const p = tspl(t, { plan: 14 })

  const client = new Client('http://localhost:5000')

  try {
    client.dispatch({
      path: '/',
      method: 'GET',
      upgrade: 1
    }, null)
  } catch (err) {
    p.ok(err instanceof errors.InvalidArgumentError)
    p.strictEqual(err.message, 'handler must be an object')
  }

  try {
    client.dispatch({
      path: '/',
      method: 'GET',
      upgrade: 1
    }, 'asd')
  } catch (err) {
    p.ok(err instanceof errors.InvalidArgumentError)
    p.strictEqual(err.message, 'handler must be an object')
  }

  client.dispatch({
    path: '/',
    method: 'GET',
    upgrade: 1
  }, {
    onResponseError (_controller, err) {
      p.ok(err instanceof errors.InvalidArgumentError)
      p.strictEqual(err.message, 'upgrade must be a string')
    }
  })

  client.dispatch({
    path: '/',
    method: 'GET',
    headersTimeout: 'asd'
  }, {
    onResponseError (_controller, err) {
      p.ok(err instanceof errors.InvalidArgumentError)
      p.strictEqual(err.message, 'invalid headersTimeout')
    }
  })

  client.dispatch({
    path: '/',
    method: 'GET',
    bodyTimeout: 'asd'
  }, {
    onResponseError (_controller, err) {
      p.ok(err instanceof errors.InvalidArgumentError)
      p.strictEqual(err.message, 'invalid bodyTimeout')
    }
  })

  client.dispatch({
    origin: 'another',
    path: '/',
    method: 'GET',
    bodyTimeout: 'asd'
  }, {
    onResponseError (_controller, err) {
      p.ok(err instanceof errors.InvalidArgumentError)
      p.strictEqual(err.message, 'invalid bodyTimeout')
    }
  })

  client.dispatch(null, {
    onResponseError (_controller, err) {
      p.ok(err instanceof errors.InvalidArgumentError)
      p.strictEqual(err.message, 'opts must be an object.')
    }
  })
})

test('basic dispatch get', async (t) => {
  const p = tspl(t, { plan: 11 })

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    p.strictEqual('/', req.url)
    p.strictEqual('GET', req.method)
    p.strictEqual(`localhost:${server.address().port}`, req.headers.host)
    p.strictEqual(undefined, req.headers.foo)
    p.strictEqual('bar', req.headers.bar)
    p.strictEqual('', req.headers.baz)
    p.strictEqual(undefined, req.headers['content-length'])
    res.end('hello')
  })
  t.after(closeServerAsPromise(server))

  const reqHeaders = {
    foo: undefined,
    bar: 'bar',
    baz: null
  }

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(() => { return client.close() })

    const bufs = []
    client.dispatch({
      path: '/',
      method: 'GET',
      headers: reqHeaders
    }, {
      onRequestStart () {
      },
      onResponseStart (controller, statusCode) {
        const rawHeaders = controller.rawHeaders
        p.strictEqual(statusCode, 200)
        p.strictEqual(Array.isArray(rawHeaders), true)
      },
      onResponseData (_controller, buf) {
        bufs.push(buf)
      },
      onResponseEnd (controller) {
        p.deepStrictEqual(controller.rawTrailers, [])
        p.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      },
      onResponseError () {
        p.ok(0)
      }
    })
  })

  await p.completed
})

test('trailers dispatch get', async (t) => {
  const p = tspl(t, { plan: 12 })

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    p.strictEqual('/', req.url)
    p.strictEqual('GET', req.method)
    p.strictEqual(`localhost:${server.address().port}`, req.headers.host)
    p.strictEqual(undefined, req.headers.foo)
    p.strictEqual('bar', req.headers.bar)
    p.strictEqual(undefined, req.headers['content-length'])
    res.addTrailers({ 'Content-MD5': 'test' })
    res.setHeader('Content-Type', 'text/plain')
    res.setHeader('Trailer', 'Content-MD5')
    res.end('hello')
  })
  t.after(closeServerAsPromise(server))

  const reqHeaders = {
    foo: undefined,
    bar: 'bar'
  }

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(() => { return client.close() })

    const bufs = []
    client.dispatch({
      path: '/',
      method: 'GET',
      headers: reqHeaders
    }, {
      onRequestStart () {
      },
      onResponseStart (controller, statusCode) {
        const rawHeaders = controller.rawHeaders
        p.strictEqual(statusCode, 200)
        p.strictEqual(Array.isArray(rawHeaders), true)
        {
          const contentTypeIdx = rawHeaders.findIndex(x => x.toString() === 'Content-Type')
          p.strictEqual(rawHeaders[contentTypeIdx + 1].toString(), 'text/plain')
        }
      },
      onResponseData (_controller, buf) {
        bufs.push(buf)
      },
      onResponseEnd (controller) {
        const rawTrailers = controller.rawTrailers
        p.strictEqual(Array.isArray(rawTrailers), true)
        {
          const contentMD5Idx = rawTrailers.findIndex(x => x.toString() === 'Content-MD5')
          p.strictEqual(rawTrailers[contentMD5Idx + 1].toString(), 'test')
        }
        p.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      },
      onResponseError () {
        p.ok(0)
      }
    })
  })

  await p.completed
})

test('dispatch onResponseStart error', async (t) => {
  const p = tspl(t, { plan: 1 })

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end()
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(() => { return client.close() })

    const _err = new Error()
    client.dispatch({
      path: '/',
      method: 'GET'
    }, {
      onRequestStart () {
      },
      onResponseStart (_controller, statusCode, _headers) {
        throw _err
      },
      onResponseData (_controller, buf) {
        p.ok(0)
      },
      onResponseEnd (_controller, _trailers) {
        p.ok(0)
      },
      onResponseError (_controller, err) {
        p.strictEqual(err, _err)
      }
    })
  })

  await p.completed
})

test('dispatch onResponseEnd error', async (t) => {
  const p = tspl(t, { plan: 2 })

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end()
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(() => { return client.close() })

    const _err = new Error()
    client.dispatch({
      path: '/',
      method: 'GET'
    }, {
      onRequestStart () {
      },
      onResponseStart (_controller, statusCode, _headers) {
        p.ok(1)
      },
      onResponseData (_controller, buf) {
        p.ok(0)
      },
      onResponseEnd (_controller, _trailers) {
        throw _err
      },
      onResponseError (_controller, err) {
        p.strictEqual(err, _err)
      }
    })
  })

  await p.completed
})

test('dispatch onResponseData error', async (t) => {
  const p = tspl(t, { plan: 2 })

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end('ad')
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(() => { return client.close() })

    const _err = new Error()
    client.dispatch({
      path: '/',
      method: 'GET'
    }, {
      onRequestStart () {
      },
      onResponseStart (_controller, statusCode, _headers) {
        p.ok(1)
      },
      onResponseData (_controller, buf) {
        throw _err
      },
      onResponseEnd (_controller, _trailers) {
        p.ok(0)
      },
      onResponseError (_controller, err) {
        p.strictEqual(err, _err)
      }
    })
  })

  await p.completed
})

test('dispatch onRequestStart error', async (t) => {
  const p = tspl(t, { plan: 1 })

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end('ad')
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(() => { return client.close() })

    const _err = new Error()
    client.dispatch({
      path: '/',
      method: 'GET'
    }, {
      onRequestStart () {
        throw _err
      },
      onResponseStart (_controller, statusCode, _headers) {
        p.ok(0)
      },
      onResponseData (_controller, buf) {
        p.ok(0)
      },
      onResponseEnd (_controller, _trailers) {
        p.ok(0)
      },
      onResponseError (_controller, err) {
        p.strictEqual(err, _err)
      }
    })
  })

  await p.completed
})

test('connect call onRequestUpgrade once', async (t) => {
  const p = tspl(t, { plan: 2 })

  const server = http.createServer({ joinDuplicateHeaders: true }, (c) => {
    p.ok(0)
  })
  server.on('connect', (req, socket, firstBodyChunk) => {
    socket.write('HTTP/1.1 200 Connection established\r\n\r\n')

    let data = firstBodyChunk.toString()
    socket.on('data', (buf) => {
      data += buf.toString()
    })

    socket.on('end', () => {
      socket.end(data)
    })
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(() => { return client.close() })

    let recvData = ''
    let count = 0
    client.dispatch({
      method: 'CONNECT',
      path: '/'
    }, {
      onRequestStart () {
      },
      onResponseStart (_controller, statusCode, _headers) {
        t.ok(true, 'should not throw')
      },
      onRequestUpgrade (_controller, statusCode, _headers, socket) {
        p.strictEqual(count++, 0)

        socket.on('data', (d) => {
          recvData += d
        })

        socket.on('end', () => {
          p.strictEqual(recvData.toString(), 'Body')
        })

        socket.write('Body')
        socket.end()
      },
      onResponseData (_controller, buf) {
        p.ok(0)
      },
      onResponseEnd (_controller, _trailers) {
        p.ok(0)
      },
      onResponseError () {
        p.ok(0)
      }
    })
  })

  await p.completed
})

test('dispatch onResponseStart missing', async (t) => {
  const p = tspl(t, { plan: 1 })

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end('ad')
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(() => { return client.close() })

    client.dispatch({
      path: '/',
      method: 'GET'
    }, {
      onRequestStart () {
      },
      onResponseData (_controller, buf) {
        p.ok(0, 'should not throw')
      },
      onResponseEnd (_controller, _trailers) {
        p.ok(0, 'should not throw')
      },
      onResponseError (_controller, err) {
        p.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
      }
    })
  })

  await p.completed
})

test('dispatch onResponseData missing', async (t) => {
  const p = tspl(t, { plan: 1 })

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end('ad')
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(() => { return client.close() })

    client.dispatch({
      path: '/',
      method: 'GET'
    }, {
      onRequestStart () {
      },
      onResponseStart (_controller, statusCode, _headers) {
        p.ok(0, 'should not throw')
      },
      onResponseEnd (_controller, _trailers) {
        p.ok(0, 'should not throw')
      },
      onResponseError (_controller, err) {
        p.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
      }
    })
  })

  await p.completed
})

test('dispatch onResponseEnd missing', async (t) => {
  const p = tspl(t, { plan: 1 })

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end('ad')
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(() => { return client.close() })

    client.dispatch({
      path: '/',
      method: 'GET'
    }, {
      onRequestStart () {
      },
      onResponseStart (_controller, statusCode, _headers) {
        p.ok(0)
      },
      onResponseData (_controller, buf) {
        p.ok(0)
      },
      onResponseError (_controller, err) {
        p.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
      }
    })
  })

  await p.completed
})

test('dispatch onResponseError missing', async (t) => {
  const p = tspl(t, { plan: 1 })

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end('ad')
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(() => { return client.close() })

    try {
      client.dispatch({
        path: '/',
        method: 'GET'
      }, {
        onRequestStart () {
        },
        onResponseStart (_controller, statusCode, _headers) {
          p.ok(0)
        },
        onResponseData (_controller, buf) {
          p.ok(0)
        },
        onResponseEnd (_controller, _trailers) {
          p.ok(0)
        }
      })
    } catch (err) {
      p.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
    }
  })

  await p.completed
})

test('dispatch CONNECT onRequestUpgrade missing', async (t) => {
  const p = tspl(t, { plan: 2 })

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end('ad')
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(() => client.destroy.bind(client)())

    client.dispatch({
      path: '/',
      method: 'GET',
      upgrade: 'Websocket'
    }, {
      onRequestStart () {
      },
      onResponseStart (_controller, statusCode, _headers) {
      },
      onResponseError (_controller, err) {
        p.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
        p.strictEqual(err.message, 'invalid onRequestUpgrade method')
      }
    })
  })

  await p.completed
})

test('dispatch upgrade onRequestUpgrade missing', async (t) => {
  const p = tspl(t, { plan: 2 })

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end('ad')
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(() => { return client.close() })

    client.dispatch({
      path: '/',
      method: 'GET',
      upgrade: 'Websocket'
    }, {
      onRequestStart () {
      },
      onResponseStart (_controller, statusCode, _headers) {
      },
      onResponseError (_controller, err) {
        p.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
        p.strictEqual(err.message, 'invalid onRequestUpgrade method')
      }
    })
  })

  await p.completed
})

test('dispatch pool onResponseError missing', async (t) => {
  const p = tspl(t, { plan: 2 })

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end('ad')
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Pool(`http://localhost:${server.address().port}`)
    t.after(() => { return client.close() })

    try {
      client.dispatch({
        path: '/',
        method: 'GET',
        upgrade: 1
      }, {
      })
    } catch (err) {
      p.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
      p.strictEqual(err.message, 'upgrade must be a string')
    }
  })

  await p.completed
})

test('dispatch onBodySent not a function', async (t) => {
  const p = tspl(t, { plan: 2 })
  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end('ad')
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Pool(`http://localhost:${server.address().port}`)
    t.after(() => { return client.close() })

    client.dispatch({
      path: '/',
      method: 'GET'
    }, {
      onBodySent: '42',
      onRequestStart () {},
      onResponseStart () {},
      onResponseData () {},
      onResponseError (_controller, err) {
        p.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
        p.strictEqual(err.message, 'invalid onBodySent method')
      }
    })
  })

  await p.completed
})

test('dispatch onBodySent buffer', async (t) => {
  const p = tspl(t, { plan: 3 })

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end('ad')
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Pool(`http://localhost:${server.address().port}`)
    t.after(() => { return client.close() })
    const body = 'hello 🚀'
    client.dispatch({
      path: '/',
      method: 'POST',
      body
    }, {
      onBodySent (chunk) {
        p.strictEqual(chunk.toString(), body)
      },
      onRequestSent () {
        p.ok(1)
      },
      onResponseError (_controller, err) {
        throw err
      },
      onRequestStart () {},
      onResponseStart () {},
      onResponseData () {},
      onResponseEnd () {
        p.ok(1)
      }
    })
  })

  await p.completed
})

test('dispatch onBodySent stream', async (t) => {
  const p = tspl(t, { plan: 8 })
  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end('ad')
  })
  t.after(closeServerAsPromise(server))
  const chunks = ['he', 'llo', 'world', '🚀']
  const toSendBytes = chunks.reduce((a, b) => a + Buffer.byteLength(b), 0)
  const body = stream.Readable.from(chunks)
  server.listen(0, () => {
    const client = new Pool(`http://localhost:${server.address().port}`)
    t.after(() => { return client.close() })
    let sentBytes = 0
    let currentChunk = 0
    client.dispatch({
      path: '/',
      method: 'POST',
      body
    }, {
      onBodySent (chunk) {
        p.strictEqual(chunks[currentChunk++], chunk)
        sentBytes += Buffer.byteLength(chunk)
      },
      onRequestSent () {
        p.ok(1)
      },
      onResponseError (_controller, err) {
        throw err
      },
      onRequestStart () {},
      onResponseStart () {},
      onResponseData () {},
      onResponseEnd () {
        p.strictEqual(currentChunk, chunks.length)
        p.strictEqual(sentBytes, toSendBytes)
        p.ok(1)
      }
    })
  })

  await p.completed
})

test('dispatch onBodySent async-iterable', (t, done) => {
  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end('ad')
  })
  t.after(closeServerAsPromise(server))
  const chunks = ['he', 'llo', 'world', '🚀']
  const toSendBytes = chunks.reduce((a, b) => a + Buffer.byteLength(b), 0)
  server.listen(0, () => {
    const client = new Pool(`http://localhost:${server.address().port}`)
    t.after(() => { return client.close() })
    let sentBytes = 0
    let currentChunk = 0
    client.dispatch({
      path: '/',
      method: 'POST',
      body: chunks
    }, {
      onBodySent (chunk) {
        assert.strictEqual(chunks[currentChunk++], chunk)
        sentBytes += Buffer.byteLength(chunk)
      },
      onResponseError (_controller, err) {
        throw err
      },
      onRequestStart () {},
      onResponseStart () {},
      onResponseData () {},
      onResponseEnd () {
        assert.strictEqual(currentChunk, chunks.length)
        assert.strictEqual(sentBytes, toSendBytes)
        done()
      }
    })
  })
})

test('dispatch onBodySent throws error', (t, done) => {
  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end('ended')
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Pool(`http://localhost:${server.address().port}`)
    t.after(() => { return client.close() })
    const body = 'hello'
    client.dispatch({
      path: '/',
      method: 'POST',
      body
    }, {
      onBodySent (chunk) {
        throw new Error('fail')
      },
      onResponseError (_controller, err) {
        assert.ok(err instanceof Error)
        assert.strictEqual(err.message, 'fail')
        done()
      },
      onRequestStart () {},
      onResponseStart () {},
      onResponseData () {},
      onResponseEnd () {}
    })
  })
})

test('dispatches in expected order', async (t) => {
  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end('ended')
  })
  t.after(closeServerAsPromise(server))

  const p = tspl(t, { plan: 1 })

  server.listen(0, () => {
    const client = new Pool(`http://localhost:${server.address().port}`)

    t.after(() => { return client.close() })

    const dispatches = []

    client.dispatch({
      path: '/',
      method: 'POST',
      body: 'body'
    }, {
      onRequestStart () {
        dispatches.push('onRequestStart')
      },
      onBodySent () {
        dispatches.push('onBodySent')
      },
      onResponseStarted () {
        dispatches.push('onResponseStarted')
      },
      onResponseStart () {
        dispatches.push('onResponseStart')
      },
      onResponseData () {
        dispatches.push('onResponseData')
      },
      onResponseEnd () {
        dispatches.push('onResponseEnd')
        p.deepStrictEqual(dispatches, ['onRequestStart', 'onBodySent', 'onResponseStarted', 'onResponseStart', 'onResponseData', 'onResponseEnd'])
      },
      onResponseError (_controller, err) {
        p.ifError(err)
      }
    })
  })

  await p.completed
})

test('dispatches in expected order for http2', async (t) => {
  const server = createSecureServer(pem)
  server.on('stream', (stream) => {
    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      ':status': 200
    })
    stream.end('ended')
  })

  const p = tspl(t, { plan: 1 })

  server.listen(0, () => {
    const client = new Pool(`https://localhost:${server.address().port}`, {
      connect: {
        rejectUnauthorized: false
      },
      allowH2: true
    })

    t.after(closeClientAndServerAsPromise(client, server))

    const dispatches = []

    client.dispatch({
      path: '/',
      method: 'POST',
      body: 'body'
    }, {
      onRequestStart () {
        dispatches.push('onRequestStart')
      },
      onBodySent () {
        dispatches.push('onBodySent')
      },
      onResponseStarted () {
        dispatches.push('onResponseStarted')
      },
      onResponseStart () {
        dispatches.push('onResponseStart')
      },
      onResponseData () {
        dispatches.push('onResponseData')
      },
      onResponseEnd () {
        dispatches.push('onResponseEnd')
        p.deepStrictEqual(dispatches, ['onRequestStart', 'onBodySent', 'onResponseStarted', 'onResponseStart', 'onResponseData', 'onResponseEnd'])
      },
      onResponseError (_controller, err) {
        p.ifError(err)
      }
    })
  })

  await p.completed
})

test('Issue#3065 - fix bad destroy handling', async (t) => {
  const p = tspl(t, { plan: 4 })
  const server = https.createServer({ ...pem, joinDuplicateHeaders: true }, (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('ended')
  })

  server.listen(0, () => {
    const client = new Client(`https://localhost:${server.address().port}`, {
      connect: {
        rejectUnauthorized: false
      }
    })

    t.after(closeClientAndServerAsPromise(client, server))

    const dispatches = []
    const dispatches2 = []

    client.once('disconnect', (...args) => {
      const [,, err] = args
      p.strictEqual(err.code, 'UND_ERR_INFO')
      p.strictEqual(err.message, 'servername changed')
    })

    client.dispatch({
      path: '/',
      method: 'POST',
      body: 'body'
    }, {
      onRequestStart () {
        dispatches.push('onRequestStart')
      },
      onBodySent () {
        dispatches.push('onBodySent')
      },
      onResponseStarted () {
        dispatches.push('onResponseStarted')
      },
      onResponseStart () {
        dispatches.push('onResponseStart')
      },
      onResponseData () {
        dispatches.push('onResponseData')
      },
      onResponseEnd () {
        dispatches.push('onResponseEnd')
        p.deepStrictEqual(dispatches, ['onRequestStart', 'onBodySent', 'onResponseStarted', 'onResponseStart', 'onResponseData', 'onResponseEnd'])
      },
      onResponseError (_controller, err) {
        p.ifError(err)
      }
    })

    client.dispatch({
      servername: 'google.com',
      path: '/',
      method: 'POST',
      body: 'body'
    }, {
      onRequestStart () {
        dispatches2.push('onRequestStart')
      },
      onBodySent () {
        dispatches2.push('onBodySent')
      },
      onResponseStarted () {
        dispatches2.push('onResponseStarted')
      },
      onResponseStart () {
        dispatches2.push('onResponseStart')
      },
      onResponseData () {
        dispatches2.push('onResponseData')
      },
      onResponseEnd () {
        dispatches2.push('onResponseEnd')
        p.deepStrictEqual(dispatches2, ['onRequestStart', 'onBodySent', 'onResponseStarted', 'onResponseStart', 'onResponseData', 'onResponseEnd'])
      },
      onResponseError (_controller, err) {
        p.ifError(err)
      }
    })
  })

  await p.completed
})

test('Issue#3065 - fix bad destroy handling (h2)', async (t) => {
  // Due to we handle the session, the request for h2 will fail on servername change
  const p = tspl(t, { plan: 4 })
  const server = createSecureServer(pem)
  server.on('stream', (stream) => {
    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      ':status': 200
    })
    stream.end('ended')
  })

  server.listen(0, () => {
    const client = new Client(`https://localhost:${server.address().port}`, {
      connect: {
        rejectUnauthorized: false
      },
      allowH2: true
    })

    t.after(closeClientAndServerAsPromise(client, server))

    const dispatches = []
    const dispatches2 = []

    client.once('disconnect', (...args) => {
      const [,, err] = args
      p.strictEqual(err.code, 'UND_ERR_INFO')
      p.strictEqual(err.message, 'servername changed')
    })

    client.dispatch({
      path: '/',
      method: 'POST',
      body: 'body'
    }, {
      onRequestStart () {
        dispatches.push('onRequestStart')
      },
      onBodySent () {
        dispatches.push('onBodySent')
      },
      onResponseStarted () {
        dispatches.push('onResponseStarted')
      },
      onResponseStart () {
        dispatches.push('onResponseStart1')
      },
      onResponseData () {
        dispatches.push('onResponseData')
      },
      onResponseEnd () {
        dispatches.push('onResponseEnd')
        p.deepStrictEqual(dispatches, ['onRequestStart', 'onBodySent', 'onResponseStarted', 'onResponseStart1', 'onResponseData', 'onResponseEnd'])
      },
      onResponseError (_controller, err) {
        p.ifError(err)
      }
    })

    client.dispatch({
      servername: 'google.com',
      path: '/',
      method: 'POST',
      body: 'body'
    }, {
      onRequestStart () {
        dispatches2.push('onRequestStart')
      },
      onBodySent () {
        dispatches2.push('onBodySent')
      },
      onResponseStarted () {
        dispatches2.push('onResponseStarted')
      },
      onResponseStart () {
        dispatches2.push('onResponseStart2')
      },
      onResponseData () {
        dispatches2.push('onResponseData')
      },
      onResponseEnd () {
        dispatches2.push('onResponseEnd')
        p.deepStrictEqual(dispatches2, ['onRequestStart', 'onBodySent', 'onResponseStarted', 'onResponseStart2', 'onResponseData', 'onResponseEnd'])
      },
      onResponseError (_controller, err) {
        p.ifError(err)
      }
    })
  })

  await p.completed
})
