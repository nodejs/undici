'use strict'

const { test } = require('tap')
const { Client, Pool, errors } = require('..')
const http = require('http')

test('dispatch invalid opts', (t) => {
  t.plan(3)

  const client = new Client('http://localhost:5000')

  client.dispatch({
    path: '/',
    method: 'GET',
    upgrade: 1
  }, {
    onError (err) {
      t.ok(err instanceof errors.InvalidArgumentError)
    }
  })

  client.dispatch({
    path: '/',
    method: 'GET',
    headersTimeout: 'asd'
  }, {
    onError (err) {
      t.ok(err instanceof errors.InvalidArgumentError)
    }
  })

  client.dispatch({
    path: '/',
    method: 'GET',
    bodyTimeout: 'asd'
  }, {
    onError (err) {
      t.ok(err instanceof errors.InvalidArgumentError)
    }
  })
})

test('basic dispatch get', (t) => {
  t.plan(11)

  const server = http.createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    t.strictEqual(`localhost:${server.address().port}`, req.headers.host)
    t.strictEqual(undefined, req.headers.foo)
    t.strictEqual('bar', req.headers.bar)
    t.strictEqual('null', req.headers.baz)
    t.strictEqual(undefined, req.headers['content-length'])
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  const reqHeaders = {
    foo: undefined,
    bar: 'bar',
    baz: null
  }

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    const bufs = []
    client.dispatch({
      path: '/',
      method: 'GET',
      headers: reqHeaders
    }, {
      onConnect () {
      },
      onHeaders (statusCode, headers) {
        t.strictEqual(statusCode, 200)
        t.strictEqual(Array.isArray(headers), true)
      },
      onData (buf) {
        bufs.push(buf)
      },
      onComplete (trailers) {
        t.strictEqual(trailers, null)
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      },
      onError () {
        t.fail()
      }
    })
  })
})

test('trailers dispatch get', (t) => {
  t.plan(12)

  const server = http.createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    t.strictEqual(`localhost:${server.address().port}`, req.headers.host)
    t.strictEqual(undefined, req.headers.foo)
    t.strictEqual('bar', req.headers.bar)
    t.strictEqual(undefined, req.headers['content-length'])
    res.addTrailers({ 'Content-MD5': 'test' })
    res.setHeader('Content-Type', 'text/plain')
    res.setHeader('Trailer', 'Content-MD5')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  const reqHeaders = {
    foo: undefined,
    bar: 'bar'
  }

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    const bufs = []
    client.dispatch({
      path: '/',
      method: 'GET',
      headers: reqHeaders
    }, {
      onConnect () {
      },
      onHeaders (statusCode, headers) {
        t.strictEqual(statusCode, 200)
        t.strictEqual(Array.isArray(headers), true)
        {
          const contentTypeIdx = headers.findIndex(x => x === 'Content-Type')
          t.strictEqual(headers[contentTypeIdx + 1], 'text/plain')
        }
      },
      onData (buf) {
        bufs.push(buf)
      },
      onComplete (trailers) {
        t.strictEqual(Array.isArray(trailers), true)
        {
          const contentMD5Idx = trailers.findIndex(x => x === 'Content-MD5')
          t.strictEqual(trailers[contentMD5Idx + 1], 'test')
        }
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      },
      onError () {
        t.fail()
      }
    })
  })
})

test('dispatch onHeaders error', (t) => {
  t.plan(1)

  const server = http.createServer((req, res) => {
    res.end()
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

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
        t.fail()
      },
      onComplete (trailers) {
        t.fail()
      },
      onError (err) {
        t.strictEqual(err, _err)
      }
    })
  })
})

test('dispatch onComplete error', (t) => {
  t.plan(2)

  const server = http.createServer((req, res) => {
    res.end()
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    const _err = new Error()
    client.dispatch({
      path: '/',
      method: 'GET'
    }, {
      onConnect () {
      },
      onHeaders (statusCode, headers) {
        t.pass()
      },
      onData (buf) {
        t.fail()
      },
      onComplete (trailers) {
        throw _err
      },
      onError (err) {
        t.strictEqual(err, _err)
      }
    })
  })
})

test('dispatch onData error', (t) => {
  t.plan(2)

  const server = http.createServer((req, res) => {
    res.end('ad')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    const _err = new Error()
    client.dispatch({
      path: '/',
      method: 'GET'
    }, {
      onConnect () {
      },
      onHeaders (statusCode, headers) {
        t.pass()
      },
      onData (buf) {
        throw _err
      },
      onComplete (trailers) {
        t.fail()
      },
      onError (err) {
        t.strictEqual(err, _err)
      }
    })
  })
})

test('dispatch onConnect error', (t) => {
  t.plan(1)

  const server = http.createServer((req, res) => {
    res.end('ad')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    const _err = new Error()
    client.dispatch({
      path: '/',
      method: 'GET'
    }, {
      onConnect () {
        throw _err
      },
      onHeaders (statusCode, headers) {
        t.fail()
      },
      onData (buf) {
        t.fail()
      },
      onComplete (trailers) {
        t.fail()
      },
      onError (err) {
        t.strictEqual(err, _err)
      }
    })
  })
})

test('connect call onUpgrade once', (t) => {
  t.plan(2)

  const server = http.createServer((c) => {
    t.fail()
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
  t.tearDown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    let recvData = ''
    let count = 0
    client.dispatch({
      method: 'CONNECT',
      path: '/'
    }, {
      onConnect () {
      },
      onHeaders (statusCode, headers) {
        t.pass('should not throw')
      },
      onUpgrade (statusCode, headers, socket) {
        t.strictEqual(count++, 0)

        socket.on('data', (d) => {
          recvData += d
        })

        socket.on('end', () => {
          t.strictEqual(recvData.toString(), 'Body')
        })

        socket.write('Body')
        socket.end()
      },
      onData (buf) {
        t.fail()
      },
      onComplete (trailers) {
        t.fail()
      },
      onError () {
        t.fail()
      }
    })
  })
})

test('dispatch onConnect missing', (t) => {
  t.plan(1)

  const server = http.createServer((req, res) => {
    res.end('ad')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.dispatch({
      path: '/',
      method: 'GET'
    }, {
      onHeaders (statusCode, headers) {
        t.pass('should not throw')
      },
      onData (buf) {
        t.pass('should not throw')
      },
      onComplete (trailers) {
        t.pass('should not throw')
      },
      onError (err) {
        t.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
      }
    })
  })
})

test('dispatch onHeaders missing', (t) => {
  t.plan(1)

  const server = http.createServer((req, res) => {
    res.end('ad')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.dispatch({
      path: '/',
      method: 'GET'
    }, {
      onConnect () {
      },
      onData (buf) {
        t.pass('should not throw')
      },
      onComplete (trailers) {
        t.pass('should not throw')
      },
      onError (err) {
        t.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
      }
    })
  })
})

test('dispatch onData missing', (t) => {
  t.plan(1)

  const server = http.createServer((req, res) => {
    res.end('ad')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.dispatch({
      path: '/',
      method: 'GET'
    }, {
      onConnect () {
      },
      onHeaders (statusCode, headers) {
        t.pass('should not throw')
      },
      onComplete (trailers) {
        t.pass('should not throw')
      },
      onError (err) {
        t.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
      }
    })
  })
})

test('dispatch onComplete missing', (t) => {
  t.plan(1)

  const server = http.createServer((req, res) => {
    res.end('ad')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.dispatch({
      path: '/',
      method: 'GET'
    }, {
      onConnect () {
      },
      onHeaders (statusCode, headers) {
        t.pass('should not throw')
      },
      onData (buf) {
        t.pass('should not throw')
      },
      onError (err) {
        t.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
      }
    })
  })
})

test('dispatch onError missing', (t) => {
  t.plan(1)

  const server = http.createServer((req, res) => {
    res.end('ad')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    try {
      client.dispatch({
        path: '/',
        method: 'GET'
      }, {
        onConnect () {
        },
        onHeaders (statusCode, headers) {
          t.pass('should not throw')
        },
        onData (buf) {
          t.pass('should not throw')
        },
        onComplete (trailers) {
          t.pass('should not throw')
        }
      })
    } catch (err) {
      t.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
    }
  })
})

test('dispatch CONNECT onUpgrade missing', (t) => {
  t.plan(2)

  const server = http.createServer((req, res) => {
    res.end('ad')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

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
        t.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
        t.strictEqual(err.message, 'invalid onUpgrade method')
      }
    })
  })
})

test('dispatch upgrade onUpgrade missing', (t) => {
  t.plan(2)

  const server = http.createServer((req, res) => {
    res.end('ad')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

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
        t.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
        t.strictEqual(err.message, 'invalid onUpgrade method')
      }
    })
  })
})

test('dispatch pool onError missing', (t) => {
  t.plan(2)

  const server = http.createServer((req, res) => {
    res.end('ad')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Pool(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    try {
      client.dispatch({
        path: '/',
        method: 'GET',
        upgrade: 'Websocket'
      }, {
      })
    } catch (err) {
      t.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
      t.strictEqual(err.message, 'invalid onError method')
    }
  })
})
