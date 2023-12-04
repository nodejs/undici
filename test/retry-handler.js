'use strict'
const { createServer } = require('node:http')
const { once } = require('node:events')

const tap = require('tap')

const { RetryHandler, Client } = require('..')
const { RequestHandler } = require('../lib/api/api-request')

tap.test('Should retry status code', t => {
  let counter = 0
  const chunks = []
  const server = createServer()
  const dispatchOptions = {
    retryOptions: {
      retry: (err, { state, opts }, done) => {
        counter++

        if (
          err.statusCode === 500 ||
          err.message.includes('other side closed')
        ) {
          setTimeout(done, 500)
          return
        }

        return done(err)
      }
    },
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
          t.equal(counter, 2)
        },
        onError () {
          t.fail()
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
    retryOptions: {
      retry: function (err, _, done) {
        counter++

        if (err.code && err.code === 'UND_ERR_DESTROYED') {
          return done(false)
        }

        if (err.statusCode === 206) return done(err)

        setTimeout(done, 800)
      }
    },
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  t.plan(8)

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const handler = new RetryHandler(dispatchOptions, {
      dispatch: (...args) => {
        return client.dispatch(...args)
      },
      handler: {
        onRequestSent () {
          t.pass()
        },
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

    t.teardown(async () => {
      await client.close()

      server.close()
      await once(server, 'close')
    })
  })
})

tap.test('Should handle 206 partial content - bad-etag', t => {
  const chunks = []

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
      res.setHeader('etag', 'erwsd')
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
            t.pass()
            return true
          },
          onData (chunk) {
            chunks.push(chunk)
            return true
          },
          onComplete () {
            t.error('should not complete')
          },
          onError (err) {
            t.equal(Buffer.concat(chunks).toString('utf-8'), 'abc')
            t.equal(err.code, 'UND_ERR_REQ_RETRY')
          }
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

tap.test('retrying a request with a body', t => {
  let counter = 0
  const server = createServer()
  const dispatchOptions = {
    retryOptions: {
      retry: (err, { state, opts }, done) => {
        counter++

        if (
          err.statusCode === 500 ||
          err.message.includes('other side closed')
        ) {
          setTimeout(done, 500)
          return
        }

        return done(err)
      }
    },
    method: 'POST',
    path: '/',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({ hello: 'world' })
  }

  t.plan(1)

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
    const handler = new RetryHandler(dispatchOptions, {
      dispatch: client.dispatch.bind(client),
      handler: new RequestHandler(dispatchOptions, (err, data) => {
        t.error(err)
      })
    })

    t.teardown(async () => {
      await client.close()
      server.close()

      await once(server, 'close')
    })

    client.dispatch(
      {
        method: 'POST',
        path: '/',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({ hello: 'world' })
      },
      handler
    )
  })
})

tap.test('should not error if request is not meant to be retried', t => {
  const server = createServer()
  server.on('request', (req, res) => {
    res.writeHead(400)
    res.end('Bad request')
  })

  t.plan(3)

  const dispatchOptions = {
    retryOptions: {
      method: 'GET',
      path: '/',
      headers: {
        'content-type': 'application/json'
      }
    }
  }

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const chunks = []
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
          t.equal(status, 400)
          return true
        },
        onData (chunk) {
          chunks.push(chunk)
          return true
        },
        onComplete () {
          t.equal(Buffer.concat(chunks).toString('utf-8'), 'Bad request')
        },
        onError (err) {
          console.log({ err })
          t.fail()
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
