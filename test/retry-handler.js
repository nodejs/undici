'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { Readable } = require('node:stream')

const { RetryHandler, Client } = require('..')
const { RequestHandler } = require('../lib/api/api-request')

test('Should retry status code', async t => {
  t = tspl(t, { plan: 3 })

  let counter = 0
  const chunks = []
  const server = createServer()
  const dispatchOptions = {
    retryOptions: {
      retry: (err, { state, opts }, done) => {
        ++counter

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
          t.ok(true, 'pass')
        },
        onHeaders (status, _rawHeaders, resume, _statusMessage) {
          t.strictEqual(status, 200)
          return true
        },
        onData (chunk) {
          chunks.push(chunk)
          return true
        },
        onComplete () {
          t.strictEqual(Buffer.concat(chunks).toString('utf-8'), 'hello world!')
          t.strictEqual(counter, 2)
        },
        onError () {
          t.fail()
        }
      }
    })

    after(async () => {
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

  await t.completed
})

test('Should account for network and response errors', async t => {
  t = tspl(t, { plan: 3 })

  let counter = 0
  const chunks = []
  const server = createServer()
  const dispatchOptions = {
    retryOptions: {
      retry: (err, { state, opts }, done) => {
        counter = state.counter

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
          t.ok(true, 'pass')
        },
        onHeaders (status, _rawHeaders, resume, _statusMessage) {
          t.strictEqual(status, 200)
          return true
        },
        onData (chunk) {
          chunks.push(chunk)
          return true
        },
        onComplete () {
          t.strictEqual(Buffer.concat(chunks).toString('utf-8'), 'hello world!')
          t.strictEqual(counter, 2)
        },
        onError () {
          t.fail()
        }
      }
    })

    after(async () => {
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

  await t.completed
})

test('Issue #3288 - request with body (asynciterable)', async t => {
  t = tspl(t, { plan: 4 })
  const server = createServer()
  const dispatchOptions = {
    method: 'POST',
    path: '/',
    headers: {
      'content-type': 'application/json'
    },
    body: (function * () {
      yield 'hello'
      yield 'world'
    })()
  }

  server.on('request', (req, res) => {
    res.writeHead(500, {
      'content-type': 'application/json'
    })

    res.end('{"message": "failed"}')
  })

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const handler = new RetryHandler(dispatchOptions, {
      dispatch: client.dispatch.bind(client),
      handler: {
        onConnect () {
          t.ok(true, 'pass')
        },
        onHeaders (status, _rawHeaders, resume, _statusMessage) {
          return true
        },
        onData (chunk) {
          return true
        },
        onComplete () {
          t.fail()
        },
        onError (err) {
          t.equal(err.message, 'Request failed')
          t.equal(err.statusCode, 500)
          t.equal(err.data.count, 1)
        }
      }
    })

    after(async () => {
      await client.close()
      server.close()

      await once(server, 'close')
    })

    client.dispatch(
      dispatchOptions,
      handler
    )
  })

  await t.completed
})

test('Should use retry-after header for retries', async t => {
  t = tspl(t, { plan: 3 })

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
          t.ok(true, 'pass')
        },
        onHeaders (status, _rawHeaders, resume, _statusMessage) {
          t.strictEqual(status, 200)
          return true
        },
        onData (chunk) {
          chunks.push(chunk)
          return true
        },
        onComplete () {
          t.strictEqual(Buffer.concat(chunks).toString('utf-8'), 'hello world!')
        },
        onError (err) {
          t.ifError(err)
        }
      }
    })

    after(async () => {
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

  await t.completed
})

test('Should use retry-after header for retries (date)', async t => {
  t = tspl(t, { plan: 3 })

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
          t.ok(true, 'pass')
        },
        onHeaders (status, _rawHeaders, resume, _statusMessage) {
          t.strictEqual(status, 200)
          return true
        },
        onData (chunk) {
          chunks.push(chunk)
          return true
        },
        onComplete () {
          t.strictEqual(Buffer.concat(chunks).toString('utf-8'), 'hello world!')
        },
        onError (err) {
          t.ifError(err)
        }
      }
    })

    after(async () => {
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

  await t.completed
})

test('Should retry with defaults', async t => {
  t = tspl(t, { plan: 3 })

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

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const handler = new RetryHandler(dispatchOptions, {
      dispatch: client.dispatch.bind(client),
      handler: {
        onConnect () {
          t.ok(true, 'pass')
        },
        onHeaders (status, _rawHeaders, resume, _statusMessage) {
          t.strictEqual(status, 200)
          return true
        },
        onData (chunk) {
          chunks.push(chunk)
          return true
        },
        onComplete () {
          t.strictEqual(Buffer.concat(chunks).toString('utf-8'), 'hello world!')
        },
        onError (err) {
          t.ifError(err)
        }
      }
    })

    after(async () => {
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

  await t.completed
})

test('Should handle 206 partial content', async t => {
  t = tspl(t, { plan: 6 })

  const chunks = []
  let counter = 0

  // Took from: https://github.com/nxtedition/nxt-lib/blob/4b001ebc2f22cf735a398f35ff800dd553fe5933/test/undici/retry.js#L47
  let x = 0
  const server = createServer((req, res) => {
    if (x === 0) {
      t.ok(true, 'pass')
      res.setHeader('etag', 'asd')
      res.write('abc')
      setTimeout(() => {
        res.destroy()
      }, 1e2)
    } else if (x === 1) {
      t.deepStrictEqual(req.headers.range, 'bytes=3-')
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

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const handler = new RetryHandler(dispatchOptions, {
      dispatch: (...args) => {
        return client.dispatch(...args)
      },
      handler: {
        onConnect () {
          t.ok(true, 'pass')
        },
        onHeaders (status, _rawHeaders, _resume, _statusMessage) {
          t.strictEqual(status, 200)
          return true
        },
        onData (chunk) {
          chunks.push(chunk)
          return true
        },
        onComplete () {
          t.strictEqual(Buffer.concat(chunks).toString('utf-8'), 'abcdef')
          t.strictEqual(counter, 1)
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

    after(async () => {
      await client.close()

      server.close()
      await once(server, 'close')
    })
  })

  await t.completed
})

test('Should handle 206 partial content - bad-etag', async t => {
  t = tspl(t, { plan: 7 })

  const chunks = []

  // Took from: https://github.com/nxtedition/nxt-lib/blob/4b001ebc2f22cf735a398f35ff800dd553fe5933/test/undici/retry.js#L47
  let x = 0
  const server = createServer((req, res) => {
    if (x === 0) {
      t.ok(true, 'pass')
      res.setHeader('etag', 'asd')
      res.write('abc')
      setTimeout(() => {
        res.destroy()
      }, 1e2)
    } else if (x === 1) {
      t.deepStrictEqual(req.headers.range, 'bytes=3-')
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
            t.ok(true, 'pass')
          },
          onHeaders (_status, _rawHeaders, _resume, _statusMessage) {
            return true
          },
          onData (chunk) {
            chunks.push(chunk)
            return true
          },
          onComplete () {
            t.ifError('should not complete')
          },
          onError (err) {
            t.strictEqual(Buffer.concat(chunks).toString('utf-8'), 'abc')
            t.strictEqual(err.code, 'UND_ERR_REQ_RETRY')
            t.strictEqual(err.message, 'ETag mismatch')
            t.deepEqual(err.data, { count: 2 })
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

    after(async () => {
      await client.close()

      server.close()
      await once(server, 'close')
    })
  })

  await t.completed
})

test('retrying a request with a body', async t => {
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

  t = tspl(t, { plan: 1 })

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
        t.ifError(err)
      })
    })

    after(async () => {
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

  await t.completed
})

test('retrying a request with a body (stream)', async t => {
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
    body: Readable.from(Buffer.from(JSON.stringify({ hello: 'world' })))
  }

  t = tspl(t, { plan: 3 })

  server.on('request', (req, res) => {
    switch (counter) {
      case 0:
        res.writeHead(500)
        res.end('failed')
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
        t.equal(err.statusCode, 500)
        t.equal(err.data.count, 1)
        t.equal(err.code, 'UND_ERR_REQ_RETRY')
      })
    })

    after(async () => {
      await client.close()
      server.close()

      await once(server, 'close')
    })

    client.dispatch(
      dispatchOptions,
      handler
    )
  })

  await t.completed
})

test('retrying a request with a body (buffer)', async t => {
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
    body: Buffer.from(JSON.stringify({ hello: 'world' }))
  }

  t = tspl(t, { plan: 1 })

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
        t.ifError(err)
      })
    })

    after(async () => {
      await client.close()
      server.close()

      await once(server, 'close')
    })

    client.dispatch(
      dispatchOptions,
      handler
    )
  })

  await t.completed
})

test('should not error if request is not meant to be retried', async t => {
  t = tspl(t, { plan: 3 })

  const server = createServer()
  server.on('request', (req, res) => {
    res.writeHead(400)
    res.end('Bad request')
  })

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
          t.ok(true, 'pass')
        },
        onHeaders (status, _rawHeaders, resume, _statusMessage) {
          t.strictEqual(status, 400)
          return true
        },
        onData (chunk) {
          chunks.push(chunk)
          return true
        },
        onComplete () {
          t.strictEqual(Buffer.concat(chunks).toString('utf-8'), 'Bad request')
        },
        onError (err) {
          t.fail(err)
        }
      }
    })

    after(async () => {
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

  await t.completed
})

test('Should be able to properly pass the minTimeout to the RetryContext when constructing a RetryCallback function', async t => {
  t = tspl(t, { plan: 2 })

  let counter = 0
  const server = createServer()
  server.on('request', (req, res) => {
    switch (counter) {
      case 0:
        res.writeHead(500)
        res.end('failed')
        return
      case 1:
        res.writeHead(200)
        res.end('hello world!')
        return
      default:
        t.fail()
    }
  })

  const dispatchOptions = {
    retryOptions: {
      retry: (err, { state, opts }, done) => {
        counter++
        t.strictEqual(opts.retryOptions.minTimeout, 100)

        if (err.statusCode === 500) {
          return done()
        }

        return done(err)
      },
      minTimeout: 100
    },
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const handler = new RetryHandler(dispatchOptions, {
      dispatch: client.dispatch.bind(client),
      handler: new RequestHandler(dispatchOptions, (err, data) => {
        t.ifError(err)
      })
    })

    after(async () => {
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

  await t.completed
})

test('Issue#2986 - Handle custom 206', async t => {
  t = tspl(t, { plan: 6 })

  const chunks = []
  let counter = 0

  // Took from: https://github.com/nxtedition/nxt-lib/blob/4b001ebc2f22cf735a398f35ff800dd553fe5933/test/undici/retry.js#L47
  let x = 0
  const server = createServer((req, res) => {
    if (x === 0) {
      t.deepStrictEqual(req.headers.range, 'bytes=0-3')
      res.setHeader('etag', 'asd')
      res.write('abc')
      setTimeout(() => {
        res.destroy()
      }, 1e2)
    } else if (x === 1) {
      t.deepStrictEqual(req.headers.range, 'bytes=3-')
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

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const handler = new RetryHandler(dispatchOptions, {
      dispatch: (...args) => {
        return client.dispatch(...args)
      },
      handler: {
        onConnect () {
          t.ok(true, 'pass')
        },
        onHeaders (status, _rawHeaders, resume, _statusMessage) {
          t.strictEqual(status, 200)
          return true
        },
        onData (chunk) {
          chunks.push(chunk)
          return true
        },
        onComplete () {
          t.strictEqual(Buffer.concat(chunks).toString('utf-8'), 'abcdef')
          t.strictEqual(counter, 1)
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
          'content-type': 'application/json',
          Range: 'bytes=0-3'
        }
      },
      handler
    )

    after(async () => {
      await client.close()

      server.close()
      await once(server, 'close')
    })
  })

  await t.completed
})

test('Issue#3128 - Support if-match', async t => {
  t = tspl(t, { plan: 7 })

  const chunks = []
  let counter = 0

  // Took from: https://github.com/nxtedition/nxt-lib/blob/4b001ebc2f22cf735a398f35ff800dd553fe5933/test/undici/retry.js#L47
  let x = 0
  const server = createServer((req, res) => {
    if (x === 0) {
      t.deepStrictEqual(req.headers.range, 'bytes=0-3')
      res.setHeader('etag', 'asd')
      res.write('abc')
      setTimeout(() => {
        res.destroy()
      }, 1e2)
    } else if (x === 1) {
      t.deepStrictEqual(req.headers.range, 'bytes=3-')
      t.deepStrictEqual(req.headers['if-match'], 'asd')

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

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const handler = new RetryHandler(dispatchOptions, {
      dispatch: (...args) => {
        return client.dispatch(...args)
      },
      handler: {
        onConnect () {
          t.ok(true, 'pass')
        },
        onHeaders (status, _rawHeaders, resume, _statusMessage) {
          t.strictEqual(status, 200)
          return true
        },
        onData (chunk) {
          chunks.push(chunk)
          return true
        },
        onComplete () {
          t.strictEqual(Buffer.concat(chunks).toString('utf-8'), 'abcdef')
          t.strictEqual(counter, 1)
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
          'content-type': 'application/json',
          Range: 'bytes=0-3'
        }
      },
      handler
    )

    after(async () => {
      await client.close()

      server.close()
      await once(server, 'close')
    })
  })

  await t.completed
})

test('Issue#3128 - Should ignore weak etags', async t => {
  t = tspl(t, { plan: 7 })

  const chunks = []
  let counter = 0

  // Took from: https://github.com/nxtedition/nxt-lib/blob/4b001ebc2f22cf735a398f35ff800dd553fe5933/test/undici/retry.js#L47
  let x = 0
  const server = createServer((req, res) => {
    if (x === 0) {
      t.deepStrictEqual(req.headers.range, 'bytes=0-3')
      res.setHeader('etag', 'W/asd')
      res.write('abc')
      setTimeout(() => {
        res.destroy()
      }, 1e2)
    } else if (x === 1) {
      t.deepStrictEqual(req.headers.range, 'bytes=3-')
      t.equal(req.headers['if-match'], undefined)

      res.setHeader('content-range', 'bytes 3-6/6')
      res.setHeader('etag', 'W/asd')
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

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const handler = new RetryHandler(dispatchOptions, {
      dispatch: (...args) => {
        return client.dispatch(...args)
      },
      handler: {
        onConnect () {
          t.ok(true, 'pass')
        },
        onHeaders (status, _rawHeaders, resume, _statusMessage) {
          t.strictEqual(status, 200)
          return true
        },
        onData (chunk) {
          chunks.push(chunk)
          return true
        },
        onComplete () {
          t.strictEqual(Buffer.concat(chunks).toString('utf-8'), 'abcdef')
          t.strictEqual(counter, 1)
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
          'content-type': 'application/json',
          Range: 'bytes=0-3'
        }
      },
      handler
    )

    after(async () => {
      await client.close()

      server.close()
      await once(server, 'close')
    })
  })

  await t.completed
})

test('Weak etags are ignored on range-requests', async t => {
  t = tspl(t, { plan: 7 })

  const chunks = []
  let counter = 0

  // Took from: https://github.com/nxtedition/nxt-lib/blob/4b001ebc2f22cf735a398f35ff800dd553fe5933/test/undici/retry.js#L47
  let x = 0
  const server = createServer((req, res) => {
    if (x === 0) {
      t.deepStrictEqual(req.headers.range, 'bytes=0-3')
      res.setHeader('etag', 'W/asd')
      res.write('abc')
      setTimeout(() => {
        res.destroy()
      }, 1e2)
    } else if (x === 1) {
      t.deepStrictEqual(req.headers.range, 'bytes=3-')
      t.equal(req.headers['if-match'], undefined)

      res.setHeader('content-range', 'bytes 3-6/6')
      res.setHeader('etag', 'W/efg')
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

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const handler = new RetryHandler(dispatchOptions, {
      dispatch: (...args) => {
        return client.dispatch(...args)
      },
      handler: {
        onConnect () {
          t.ok(true, 'pass')
        },
        onHeaders (status, _rawHeaders, resume, _statusMessage) {
          t.strictEqual(status, 200)
          return true
        },
        onData (chunk) {
          chunks.push(chunk)
          return true
        },
        onComplete () {
          t.strictEqual(Buffer.concat(chunks).toString('utf-8'), 'abcdef')
          t.strictEqual(counter, 1)
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
          'content-type': 'application/json',
          Range: 'bytes=0-3'
        }
      },
      handler
    )

    after(async () => {
      await client.close()

      server.close()
      await once(server, 'close')
    })
  })

  await t.completed
})

test('Should throw RequestRetryError when Content-Range mismatch', async t => {
  t = tspl(t, { plan: 8 })

  const chunks = []

  // Took from: https://github.com/nxtedition/nxt-lib/blob/4b001ebc2f22cf735a398f35ff800dd553fe5933/test/undici/retry.js#L47
  let x = 0
  const server = createServer((req, res) => {
    if (x === 0) {
      t.ok(true, 'pass')
      res.setHeader('etag', 'asd')
      res.write('abc')
      setTimeout(() => {
        res.destroy()
      }, 1e2)
    } else if (x === 1) {
      t.deepStrictEqual(req.headers.range, 'bytes=3-')
      res.setHeader('content-range', 'bytes bad') // intentionally bad to trigger error
      res.setHeader('etag', 'asd')
      res.statusCode = 206
      res.end('def')
    }
    x++
  })

  const dispatchOptions = {
    retryOptions: {
      retry: function (err, _, done) {
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

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const handler = new RetryHandler(dispatchOptions, {
      dispatch: (...args) => {
        return client.dispatch(...args)
      },
      handler: {
        onConnect () {
          t.ok(true, 'pass')
        },
        onHeaders (status, _rawHeaders, _resume, _statusMessage) {
          t.strictEqual(status, 200)
          return true
        },
        onData (chunk) {
          chunks.push(chunk)
          return true
        },
        onComplete () {
          t.ifError('should not complete')
        },
        onError (err) {
          t.strictEqual(Buffer.concat(chunks).toString('utf-8'), 'abc')
          t.strictEqual(err.code, 'UND_ERR_REQ_RETRY')
          t.strictEqual(err.message, 'Content-Range mismatch')
          t.deepEqual(err.data, { count: 2 })
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

    after(async () => {
      await client.close()

      server.close()
      await once(server, 'close')
    })
  })

  await t.completed
})
