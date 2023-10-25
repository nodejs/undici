'use strict'
const { createServer } = require('node:http')
const { once } = require('node:events')

const tap = require('tap')

const { RetryHandler, Client } = require('..')

// TODO: rewrite tests to not use explicit Promise handling
// TODO: add tests for retry-after on 429

tap.test('Should retry status code', t => {
  let counter = 0
  const chunks = []
  const server = createServer()
  const dispatchOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  t.plan(4)

  server.on('request', (req, res) => {
    switch (counter) {
      case 0:
        req.destroy()
        return
      case 1:
        res.writeHead(500)
        res.end('failed')
        return
      case 2:
        res.writeHead(200)
        res.end('hello world!')
        return
      default:
        t.fail()
    }
  })

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const handler = new RetryHandler(
      dispatchOptions,
      {
        dispatch: client.dispatch.bind(client),
        handler: {
          onConnect () {
            t.pass()
          },
          onBodySent () {
            t.pass()
          },
          onHeaders (status, _rawHeaders, resume, _statusMessage) {
            t.equal(status, 200)
            return true
          },
          onData (chunk) {
            chunks.push(chunk)
            return true
          },
          onComplete () {
            t.equal(Buffer.concat(chunks).toString('utf-8'), 'hello world!')
            t.equal(counter, 2)
          },
          onError () {
            t.fail()
          }
        }
      },
      {
        retry: err => {
          counter++

          if (
            err.statusCode === 500 ||
            err.message.includes('other side closed')
          ) {
            return 500
          }
        }
      }
    )

    t.teardown(async () => {
      await client.close()
      server.close()

      await once(server, 'close')
    })

    client.dispatch(
      {
        method: 'GET',
        path: '/',
        headers: {
          'content-type': 'application/json'
        }
      },
      handler
    )
  })
})

tap.test('Should support idempotency over safe method', t => {
  const chunks = []
  const server = createServer()
  let postCounter = 0
  let getCounter = 0
  let getIdempotentCounter = 0
  const dispatchOptions1 = {
    method: 'GET',
    path: '/1',
    headers: {
      'content-type': 'application/json'
    }
  }
  const dispatchOptions2 = {
    method: 'POST',
    path: '/2',
    headers: {
      'content-type': 'application/json'
    },
    body: 'hello world!'
  }
  const dispatchOptions3 = {
    method: 'HEAD',
    path: '/3',
    headers: {
      'content-type': 'application/json'
    }
  }

  server.on('request', (req, res) => {
    if (req.url === '/1' && req.method === 'GET') {
      switch (getCounter) {
        case 0:
          req.destroy()
          getCounter++
          return
        case 1:
          res.writeHead(500)
          res.end('failed')
          getCounter++
          return
        case 2:
          res.writeHead(200)
          res.end('hello world!')
          getCounter++
          return
        default:
          t.error('unexpected request')
      }
    } else if (req.url === '/2' && req.method === 'POST') {
      switch (postCounter) {
        case 0:
          req.destroy()
          postCounter++
          return
        default:
          t.error('unexpected request')
      }
    } else if (req.url === '/3' && req.method === 'HEAD') {
      switch (getIdempotentCounter) {
        case 0:
          res.writeHead(500)
          res.end('failed')
          getIdempotentCounter++
          return
        case 1:
          res.writeHead(200)
          res.end('hello world!')
          getIdempotentCounter++
          return
        default:
          t.error('unexpected request')
      }
    } else {
      t.error('unexpected request')
    }
  })

  t.plan(10)

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const handler = new RetryHandler(dispatchOptions1, {
      dispatch: client.dispatch.bind(client),
      handler: {
        onConnect () {
          t.pass()
        },
        onBodySent () {
          t.pass()
        },
        onHeaders (status, _rawHeaders, resume, _statusMessage) {
          t.equal(status, 200)
          return true
        },
        onData (chunk) {
          chunks.push(chunk)
          return true
        },
        onComplete () {
          t.equal(Buffer.concat(chunks).toString('utf-8'), 'hello world!')
        },
        onError (err) {
          t.error(err)
        }
      }
    })

    const handler2 = new RetryHandler(dispatchOptions2, {
      dispatch: client.dispatch.bind(client),
      handler: {
        onConnect () {
          t.pass()
        },
        onBodySent () {
          t.pass()
        },
        onHeaders (status, _rawHeaders, resume, _statusMessage) {
          t.fail()
        },
        onData (chunk) {
          t.fail()
        },
        onComplete () {
          t.fail()
        },
        onError (err) {
          t.equal(err.message, 'other side closed')
          t.equal(err.code, 'UND_ERR_SOCKET')
        }
      }
    })

    const handler3 = new RetryHandler(
      dispatchOptions3,
      {
        dispatch: client.dispatch.bind(client),
        handler: {
          onConnect () {
            t.pass()
          },
          onBodySent () {
            t.pass()
          },
          onHeaders (status, _rawHeaders, resume, _statusMessage) {
            t.equal(status, 200)
            return true
          },
          onData (chunk) {
            return true
          },
          onComplete () {
            t.pass()
          },
          onError (err) {
            t.error(err)
          }
        }
      },
      {
        idempotent: true
      }
    )

    t.teardown(async () => {
      await client.close()
      server.close()

      await once(server, 'close')
    })

    client.dispatch(
      {
        method: 'GET',
        path: '/1',
        headers: {
          'content-type': 'application/json'
        }
      },
      handler
    )

    client.dispatch(
      {
        method: 'POST',
        path: '/2',
        headers: {
          'content-type': 'application/json'
        },
        body: 'hello world!'
      },
      handler2
    )

    client.dispatch(
      {
        method: 'HEAD',
        path: '/3',
        headers: {
          'content-type': 'application/json'
        }
      },
      handler3
    )
  })
})

tap.test('Should use retry-after header for retries', t => {
  let counter = 0
  const chunks = []
  const server = createServer()
  let checkpoint
  const dispatchOptions = {
    method: 'PUT',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  t.plan(4)

  server.on('request', (req, res) => {
    switch (counter) {
      case 0:
        res.writeHead(429, {
          'retry-after': 1
        })
        res.end('rate limit')
        checkpoint = Date.now()
        counter++
        return
      case 1:
        res.writeHead(200)
        res.end('hello world!')
        t.ok(Date.now() - checkpoint >= 500)
        counter++
        return
      default:
        t.fail('unexpected request')
    }
  })

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const handler = new RetryHandler(dispatchOptions, {
      dispatch: client.dispatch.bind(client),
      handler: {
        onConnect () {
          t.pass()
        },
        onBodySent () {
          t.pass()
        },
        onHeaders (status, _rawHeaders, resume, _statusMessage) {
          t.equal(status, 200)
          return true
        },
        onData (chunk) {
          chunks.push(chunk)
          return true
        },
        onComplete () {
          t.equal(Buffer.concat(chunks).toString('utf-8'), 'hello world!')
        },
        onError (err) {
          t.error(err)
        }
      }
    })

    t.teardown(async () => {
      await client.close()
      server.close()

      await once(server, 'close')
    })

    client.dispatch(
      {
        method: 'PUT',
        path: '/',
        headers: {
          'content-type': 'application/json'
        }
      },
      handler
    )
  })
})

tap.test('Should use retry-after header for retries (date)', t => {
  let counter = 0
  const chunks = []
  const server = createServer()
  let checkpoint
  const dispatchOptions = {
    method: 'PUT',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  t.plan(4)

  server.on('request', (req, res) => {
    switch (counter) {
      case 0:
        res.writeHead(429, {
          'retry-after': new Date(
            new Date().setSeconds(new Date().getSeconds() + 1)
          ).toUTCString()
        })
        res.end('rate limit')
        checkpoint = Date.now()
        counter++
        return
      case 1:
        res.writeHead(200)
        res.end('hello world!')
        t.ok(Date.now() - checkpoint >= 1)
        counter++
        return
      default:
        t.fail('unexpected request')
    }
  })

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const handler = new RetryHandler(dispatchOptions, {
      dispatch: client.dispatch.bind(client),
      handler: {
        onConnect () {
          t.pass()
        },
        onBodySent () {
          t.pass()
        },
        onHeaders (status, _rawHeaders, resume, _statusMessage) {
          t.equal(status, 200)
          return true
        },
        onData (chunk) {
          chunks.push(chunk)
          return true
        },
        onComplete () {
          t.equal(Buffer.concat(chunks).toString('utf-8'), 'hello world!')
        },
        onError (err) {
          t.error(err)
        }
      }
    })

    t.teardown(async () => {
      await client.close()
      server.close()

      await once(server, 'close')
    })

    client.dispatch(
      {
        method: 'PUT',
        path: '/',
        headers: {
          'content-type': 'application/json'
        }
      },
      handler
    )
  })
})

tap.test('Should retry with defaults', t => {
  let counter = 0
  const chunks = []
  const server = createServer()
  const dispatchOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  server.on('request', (req, res) => {
    switch (counter) {
      case 0:
        req.destroy()
        counter++
        return
      case 1:
        res.writeHead(500)
        res.end('failed')
        counter++
        return
      case 2:
        res.writeHead(200)
        res.end('hello world!')
        counter++
        return
      default:
        t.fail()
    }
  })

  t.plan(3)

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const handler = new RetryHandler(dispatchOptions, {
      dispatch: client.dispatch.bind(client),
      handler: {
        onConnect () {
          t.pass()
        },
        onBodySent () {
          t.pass()
        },
        onHeaders (status, _rawHeaders, resume, _statusMessage) {
          t.equal(status, 200)
          return true
        },
        onData (chunk) {
          chunks.push(chunk)
          return true
        },
        onComplete () {
          t.equal(Buffer.concat(chunks).toString('utf-8'), 'hello world!')
        },
        onError (err) {
          t.error(err)
        }
      }
    })

    t.teardown(async () => {
      await client.close()
      server.close()

      await once(server, 'close')
    })

    client.dispatch(
      {
        method: 'GET',
        path: '/',
        headers: {
          'content-type': 'application/json'
        }
      },
      handler
    )
  })
})

tap.test('Should handle 206 partial content', t => {
  const chunks = []
  let counter = 0

  // Took from: https://github.com/nxtedition/nxt-lib/blob/4b001ebc2f22cf735a398f35ff800dd553fe5933/test/undici/retry.js#L47
  let x = 0
  const server = createServer((req, res) => {
    if (x === 0) {
      t.pass()
      res.setHeader('etag', 'asd')
      res.write('abc')
      setTimeout(() => {
        res.destroy()
      }, 1e2)
    } else if (x === 1) {
      t.same(req.headers.range, 'bytes=3-')
      res.setHeader('content-range', 'bytes 3-6/6')
      res.setHeader('etag', 'asd')
      res.statusCode = 206
      res.end('def')
    }
    x++
  })

  const dispatchOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  t.plan(6)

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const handler = new RetryHandler(
      dispatchOptions,
      {
        dispatch: (...args) => {
          return client.dispatch(...args)
        },
        handler: {
          onConnect () {
            t.pass()
          },
          onBodySent () {
            t.pass()
          },
          onHeaders (status, _rawHeaders, resume, _statusMessage) {
            t.equal(status, 200)
            return true
          },
          onData (chunk) {
            chunks.push(chunk)
            return true
          },
          onComplete () {
            t.equal(Buffer.concat(chunks).toString('utf-8'), 'abcdef')
            t.equal(counter, 1)
          },
          onError () {
            t.fail()
          }
        }
      },
      {
        retry: function (err) {
          counter++

          if (err.code && err.code === 'UND_ERR_DESTROYED') {
            return null
          }

          return err.statusCode === 206 ? null : 800
        }
      }
    )

    client.dispatch(
      {
        method: 'GET',
        path: '/',
        headers: {
          'content-type': 'application/json'
        }
      },
      handler
    )

    t.teardown(async () => {
      await client.close()

      server.close()
      await once(server, 'close')
    })
  })
})
