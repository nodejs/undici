'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const https = require('node:https')
const { Client, Pool, errors } = require('../..')
const stream = require('node:stream')
const { createSecureServer } = require('node:http2')
const pem = require('https-pem')
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
    onError (err) {
      p.ok(err instanceof errors.InvalidArgumentError)
      p.strictEqual(err.message, 'upgrade must be a string')
    }
  })

  client.dispatch({
    path: '/',
    method: 'GET',
    headersTimeout: 'asd'
  }, {
    onError (err) {
      p.ok(err instanceof errors.InvalidArgumentError)
      p.strictEqual(err.message, 'invalid headersTimeout')
    }
  })

  client.dispatch({
    path: '/',
    method: 'GET',
    bodyTimeout: 'asd'
  }, {
    onError (err) {
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
    onError (err) {
      p.ok(err instanceof errors.InvalidArgumentError)
      p.strictEqual(err.message, 'invalid bodyTimeout')
    }
  })

  client.dispatch(null, {
    onError (err) {
      p.ok(err instanceof errors.InvalidArgumentError)
      p.strictEqual(err.message, 'opts must be an object.')
    }
  })
})

test('basic dispatch get', async (t) => {
  const p = tspl(t, { plan: 11 })

  const server = http.createServer((req, res) => {
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
      onConnect () {
      },
      onHeaders (statusCode, headers) {
        p.strictEqual(statusCode, 200)
        p.strictEqual(Array.isArray(headers), true)
      },
      onData (buf) {
        bufs.push(buf)
      },
      onComplete (trailers) {
        p.deepStrictEqual(trailers, [])
        p.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      },
      onError () {
        p.ok(0)
      }
    })
  })

  await p.completed
})

test('trailers dispatch get', async (t) => {
  const p = tspl(t, { plan: 12 })

  const server = http.createServer((req, res) => {
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
      onConnect () {
      },
      onHeaders (statusCode, headers) {
        p.strictEqual(statusCode, 200)
        p.strictEqual(Array.isArray(headers), true)
        {
          const contentTypeIdx = headers.findIndex(x => x.toString() === 'Content-Type')
          p.strictEqual(headers[contentTypeIdx + 1].toString(), 'text/plain')
        }
      },
      onData (buf) {
        bufs.push(buf)
      },
      onComplete (trailers) {
        p.strictEqual(Array.isArray(trailers), true)
        {
          const contentMD5Idx = trailers.findIndex(x => x.toString() === 'Content-MD5')
          p.strictEqual(trailers[contentMD5Idx + 1].toString(), 'test')
        }
        p.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      },
      onError () {
        p.ok(0)
      }
    })
  })

  await p.completed
})

test('dispatch onHeaders error', async (t) => {
  const p = tspl(t, { plan: 1 })

  const server = http.createServer((req, res) => {
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
      onConnect () {
      },
      onHeaders (statusCode, headers) {
        throw _err
      },
      onData (buf) {
        p.ok(0)
      },
      onComplete (trailers) {
        p.ok(0)
      },
      onError (err) {
        p.strictEqual(err, _err)
      }
    })
  })

  await p.completed
})

test('dispatch onComplete error', async (t) => {
  const p = tspl(t, { plan: 2 })

  const server = http.createServer((req, res) => {
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
      onConnect () {
      },
      onHeaders (statusCode, headers) {
        p.ok(1)
      },
      onData (buf) {
        p.ok(0)
      },
      onComplete (trailers) {
        throw _err
      },
      onError (err) {
        p.strictEqual(err, _err)
      }
    })
  })

  await p.completed
})

test('dispatch onData error', async (t) => {
  const p = tspl(t, { plan: 2 })

  const server = http.createServer((req, res) => {
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
      onConnect () {
      },
      onHeaders (statusCode, headers) {
        p.ok(1)
      },
      onData (buf) {
        throw _err
      },
      onComplete (trailers) {
        p.ok(0)
      },
      onError (err) {
        p.strictEqual(err, _err)
      }
    })
  })

  await p.completed
})

test('dispatch onConnect error', async (t) => {
  const p = tspl(t, { plan: 1 })

  const server = http.createServer((req, res) => {
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
      onConnect () {
        throw _err
      },
      onHeaders (statusCode, headers) {
        p.ok(0)
      },
      onData (buf) {
        p.ok(0)
      },
      onComplete (trailers) {
        p.ok(0)
      },
      onError (err) {
        p.strictEqual(err, _err)
      }
    })
  })

  await p.completed
})

test('connect call onUpgrade once', async (t) => {
  const p = tspl(t, { plan: 2 })

  const server = http.createServer((c) => {
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
      onConnect () {
      },
      onHeaders (statusCode, headers) {
        t.ok(true, 'should not throw')
      },
      onUpgrade (statusCode, headers, socket) {
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
      onData (buf) {
        p.ok(0)
      },
      onComplete (trailers) {
        p.ok(0)
      },
      onError () {
        p.ok(0)
      }
    })
  })

  await p.completed
})

test('dispatch onHeaders missing', async (t) => {
  const p = tspl(t, { plan: 1 })

  const server = http.createServer((req, res) => {
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
      onConnect () {
      },
      onData (buf) {
        p.ok(0, 'should not throw')
      },
      onComplete (trailers) {
        p.ok(0, 'should not throw')
      },
      onError (err) {
        p.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
      }
    })
  })

  await p.completed
})

test('dispatch onData missing', async (t) => {
  const p = tspl(t, { plan: 1 })

  const server = http.createServer((req, res) => {
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
      onConnect () {
      },
      onHeaders (statusCode, headers) {
        p.ok(0, 'should not throw')
      },
      onComplete (trailers) {
        p.ok(0, 'should not throw')
      },
      onError (err) {
        p.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
      }
    })
  })

  await p.completed
})

test('dispatch onComplete missing', async (t) => {
  const p = tspl(t, { plan: 1 })

  const server = http.createServer((req, res) => {
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
      onConnect () {
      },
      onHeaders (statusCode, headers) {
        p.ok(0)
      },
      onData (buf) {
        p.ok(0)
      },
      onError (err) {
        p.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
      }
    })
  })

  await p.completed
})

test('dispatch onError missing', async (t) => {
  const p = tspl(t, { plan: 1 })

  const server = http.createServer((req, res) => {
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
        onConnect () {
        },
        onHeaders (statusCode, headers) {
          p.ok(0)
        },
        onData (buf) {
          p.ok(0)
        },
        onComplete (trailers) {
          p.ok(0)
        }
      })
    } catch (err) {
      p.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
    }
  })

  await p.completed
})

test('dispatch CONNECT onUpgrade missing', async (t) => {
  const p = tspl(t, { plan: 2 })

  const server = http.createServer((req, res) => {
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
      onConnect () {
      },
      onHeaders (statusCode, headers) {
      },
      onError (err) {
        p.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
        p.strictEqual(err.message, 'invalid onUpgrade method')
      }
    })
  })

  await p.completed
})

test('dispatch upgrade onUpgrade missing', async (t) => {
  const p = tspl(t, { plan: 2 })

  const server = http.createServer((req, res) => {
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
      onConnect () {
      },
      onHeaders (statusCode, headers) {
      },
      onError (err) {
        p.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
        p.strictEqual(err.message, 'invalid onUpgrade method')
      }
    })
  })

  await p.completed
})

test('dispatch pool onError missing', async (t) => {
  const p = tspl(t, { plan: 2 })

  const server = http.createServer((req, res) => {
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
  const server = http.createServer((req, res) => {
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
      onConnect () {},
      onHeaders () {},
      onData () {},
      onError (err) {
        p.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
        p.strictEqual(err.message, 'invalid onBodySent method')
      }
    })
  })

  await p.completed
})

test('dispatch onBodySent buffer', async (t) => {
  const p = tspl(t, { plan: 3 })

  const server = http.createServer((req, res) => {
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
      onError (err) {
        throw err
      },
      onConnect () {},
      onHeaders () {},
      onData () {},
      onComplete () {
        p.ok(1)
      }
    })
  })

  await p.completed
})

test('dispatch onBodySent stream', async (t) => {
  const p = tspl(t, { plan: 8 })
  const server = http.createServer((req, res) => {
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
      onError (err) {
        throw err
      },
      onConnect () {},
      onHeaders () {},
      onData () {},
      onComplete () {
        p.strictEqual(currentChunk, chunks.length)
        p.strictEqual(sentBytes, toSendBytes)
        p.ok(1)
      }
    })
  })

  await p.completed
})

test('dispatch onBodySent async-iterable', (t, done) => {
  const server = http.createServer((req, res) => {
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
      onError (err) {
        throw err
      },
      onConnect () {},
      onHeaders () {},
      onData () {},
      onComplete () {
        assert.strictEqual(currentChunk, chunks.length)
        assert.strictEqual(sentBytes, toSendBytes)
        done()
      }
    })
  })
})

test('dispatch onBodySent throws error', (t, done) => {
  const server = http.createServer((req, res) => {
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
      onError (err) {
        assert.ok(err instanceof Error)
        assert.strictEqual(err.message, 'fail')
        done()
      },
      onConnect () {},
      onHeaders () {},
      onData () {},
      onComplete () {}
    })
  })
})

test('dispatches in expected order', async (t) => {
  const server = http.createServer((req, res) => {
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
      onConnect () {
        dispatches.push('onConnect')
      },
      onBodySent () {
        dispatches.push('onBodySent')
      },
      onResponseStarted () {
        dispatches.push('onResponseStarted')
      },
      onHeaders () {
        dispatches.push('onHeaders')
      },
      onData () {
        dispatches.push('onData')
      },
      onComplete () {
        dispatches.push('onComplete')
        p.deepStrictEqual(dispatches, ['onConnect', 'onBodySent', 'onResponseStarted', 'onHeaders', 'onData', 'onComplete'])
      },
      onError (err) {
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
      onConnect () {
        dispatches.push('onConnect')
      },
      onBodySent () {
        dispatches.push('onBodySent')
      },
      onResponseStarted () {
        dispatches.push('onResponseStarted')
      },
      onHeaders () {
        dispatches.push('onHeaders')
      },
      onData () {
        dispatches.push('onData')
      },
      onComplete () {
        dispatches.push('onComplete')
        p.deepStrictEqual(dispatches, ['onConnect', 'onBodySent', 'onResponseStarted', 'onHeaders', 'onData', 'onComplete'])
      },
      onError (err) {
        p.ifError(err)
      }
    })
  })

  await p.completed
})

test('Issue#3065 - fix bad destroy handling', async (t) => {
  const p = tspl(t, { plan: 4 })
  const server = https.createServer(pem, (req, res) => {
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
      onConnect () {
        dispatches.push('onConnect')
      },
      onBodySent () {
        dispatches.push('onBodySent')
      },
      onResponseStarted () {
        dispatches.push('onResponseStarted')
      },
      onHeaders () {
        dispatches.push('onHeaders')
      },
      onData () {
        dispatches.push('onData')
      },
      onComplete () {
        dispatches.push('onComplete')
        p.deepStrictEqual(dispatches, ['onConnect', 'onBodySent', 'onResponseStarted', 'onHeaders', 'onData', 'onComplete'])
      },
      onError (err) {
        p.ifError(err)
      }
    })

    client.dispatch({
      servername: 'google.com',
      path: '/',
      method: 'POST',
      body: 'body'
    }, {
      onConnect () {
        dispatches2.push('onConnect')
      },
      onBodySent () {
        dispatches2.push('onBodySent')
      },
      onResponseStarted () {
        dispatches2.push('onResponseStarted')
      },
      onHeaders () {
        dispatches2.push('onHeaders')
      },
      onData () {
        dispatches2.push('onData')
      },
      onComplete () {
        dispatches2.push('onComplete')
        p.deepStrictEqual(dispatches2, ['onConnect', 'onBodySent', 'onResponseStarted', 'onHeaders', 'onData', 'onComplete'])
      },
      onError (err) {
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
      onConnect () {
        dispatches.push('onConnect')
      },
      onBodySent () {
        dispatches.push('onBodySent')
      },
      onResponseStarted () {
        dispatches.push('onResponseStarted')
      },
      onHeaders () {
        dispatches.push('onHeaders1')
      },
      onData () {
        dispatches.push('onData')
      },
      onComplete () {
        dispatches.push('onComplete')
        p.deepStrictEqual(dispatches, ['onConnect', 'onBodySent', 'onResponseStarted', 'onHeaders1', 'onData', 'onComplete'])
      },
      onError (err) {
        p.ifError(err)
      }
    })

    client.dispatch({
      servername: 'google.com',
      path: '/',
      method: 'POST',
      body: 'body'
    }, {
      onConnect () {
        dispatches2.push('onConnect')
      },
      onBodySent () {
        dispatches2.push('onBodySent')
      },
      onResponseStarted () {
        dispatches2.push('onResponseStarted')
      },
      onHeaders () {
        dispatches2.push('onHeaders2')
      },
      onData () {
        dispatches2.push('onData')
      },
      onComplete () {
        dispatches2.push('onComplete')
        p.deepStrictEqual(dispatches2, ['onConnect', 'onBodySent', 'onResponseStarted', 'onHeaders2', 'onData', 'onComplete'])
      },
      onError (err) {
        p.ifError(err)
      }
    })
  })

  await p.completed
})
