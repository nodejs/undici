'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { spawnSync } = require('node:child_process')

const { Client, interceptors } = require('../..')
const { retry, redirect, dns } = interceptors

test('Should retry status code', async t => {
  t = tspl(t, { plan: 4 })

  let counter = 0
  const server = createServer()
  const retryOptions = {
    retry: (err, { state, opts }, done) => {
      counter++

      if (err.statusCode === 500 || err.message.includes('other side closed')) {
        setTimeout(done, 500)
        return
      }

      return done(err)
    }
  }
  const requestOptions = {
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
        t.ok(true, 'pass')
        return
      case 1:
        res.writeHead(500)
        res.end('failed')
        t.ok(true, 'pass')
        return
      case 2:
        res.writeHead(200)
        res.end('hello world!')
        return
      default:
        t.fail()
    }
  })

  server.listen(0)

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(retry(retryOptions))

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  const response = await client.request(requestOptions)

  t.equal(response.statusCode, 200)
  t.equal(await response.body.text(), 'hello world!')
})

test('Should retry on error code', async t => {
  t = tspl(t, { plan: 2 })

  let counter = 0
  const retryOptions = {
    retry: (err, _state, done) => {
      if (counter < 5) {
        counter++
        setTimeout(done, 500)
      } else {
        done(err)
      }
    },
    maxRetries: 5
  }
  const requestOptions = {
    origin: 'http://localhost:123',
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  const client = new Client(
    'http://localhost:123'
  ).compose(dns({
    lookup: (_h, _o, cb) => {
      const error = new Error('ENOTFOUND')
      error.code = 'ENOTFOUND'

      cb(error)
    }
  }), retry(retryOptions))

  after(async () => {
    await client.close()
  })

  await t.rejects(client.request(requestOptions), { code: 'ENOTFOUND' })
  t.equal(counter, 5)
})

test('Should use retry-after header for retries', async t => {
  t = tspl(t, { plan: 3 })

  let counter = 0
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

  server.listen(0)

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(retry())

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  const response = await client.request(dispatchOptions)

  t.equal(response.statusCode, 200)
  t.equal(await response.body.text(), 'hello world!')
})

test('Should use retry-after header for retries (date)', async t => {
  t = tspl(t, { plan: 3 })

  let counter = 0
  const server = createServer()
  let checkpoint
  const requestOptions = {
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

  server.listen(0)

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(retry())

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  const response = await client.request(requestOptions)

  t.equal(response.statusCode, 200)
  t.equal(await response.body.text(), 'hello world!')
})

test('Should retry with defaults', async t => {
  t = tspl(t, { plan: 2 })

  let counter = 0
  const server = createServer()
  const requestOptions = {
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

  server.listen(0)

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(retry())

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  const response = await client.request(requestOptions)

  t.equal(response.statusCode, 200)
  t.equal(await response.body.text(), 'hello world!')
})

test('Should pass context from other interceptors', async t => {
  t = tspl(t, { plan: 2 })

  const server = createServer()
  const requestOptions = {
    method: 'GET',
    path: '/'
  }

  server.on('request', (req, res) => {
    res.writeHead(200)
    res.end('hello world!')
  })

  server.listen(0)

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(redirect({ maxRedirections: 1 }), retry())

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  const response = await client.request(requestOptions)

  t.equal(response.statusCode, 200)
  t.deepStrictEqual(response.context, { history: [] })
})

test('Should handle 206 partial content', async t => {
  t = tspl(t, { plan: 5 })

  let counter = 0

  // Took from: https://github.com/nxtedition/nxt-lib/blob/4b001ebc2f22cf735a398f35ff800dd553fe5933/test/undici/retry.js#L47
  let x = 0
  const server = createServer((req, res) => {
    if (x === 0) {
      t.ok(true, 'pass')
      res.setHeader('content-length', '6')
      res.setHeader('etag', 'asd')
      res.write('abc')
      setTimeout(() => {
        res.destroy()
      }, 1e2)
    } else if (x === 1) {
      t.deepStrictEqual(req.headers.range, 'bytes=3-5')
      res.setHeader('content-range', 'bytes 3-5/6')
      res.setHeader('etag', 'asd')
      res.statusCode = 206
      res.end('def')
    }
    x++
  })

  const retryOptions = {
    retry: function (err, _, done) {
      counter++

      if (err.code && err.code === 'UND_ERR_DESTROYED') {
        return done(false)
      }

      if (err.statusCode === 206) return done(err)

      setTimeout(done, 800)
    }
  }
  const requestOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    },
    retryOptions
  }

  server.listen(0)

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(retry())

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  const response = await client.request(requestOptions)

  t.equal(response.statusCode, 200)
  t.strictEqual(await response.body.text(), 'abcdef')
  t.strictEqual(counter, 1)
})

test('Should handle 206 partial content - bad-etag', async t => {
  t = tspl(t, { plan: 3 })

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

  const requestOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    },
    retryOptions: {
      retry: (err, { state, opts }, done) => {
        if (err.message.includes('other side closed')) {
          setTimeout(done, 100)
          return
        }

        return done(err)
      }
    }
  }

  server.listen(0)

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(retry())

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  try {
    const response = await client.request(requestOptions)
    await response.body.text()
  } catch (error) {
    t.strict(error, {
      message: 'ETag mismatch',
      code: 'UND_ERR_REQ_RETRY',
      name: 'RequestRetryError'
    })
  }
})

test('retrying a request with a body', async t => {
  t = tspl(t, { plan: 2 })
  let counter = 0
  const server = createServer()
  const requestOptions = {
    method: 'POST',
    path: '/',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({ hello: 'world' }),
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

  server.listen(0)

  await once(server, 'listening')
  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(retry())

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  const response = await client.request(requestOptions)
  t.equal(response.statusCode, 200)
  t.equal(await response.body.text(), 'hello world!')
})

test('should not error if request is not meant to be retried', async t => {
  t = tspl(t, { plan: 2 })

  const server = createServer()
  server.on('request', (req, res) => {
    res.writeHead(400)
    res.end('Bad request')
  })

  server.listen(0)

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(retry())

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  const response = await client.request({
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  })

  t.equal(response.statusCode, 400)
  t.equal(await response.body.text(), 'Bad request')
})

test('#3975 - keep event loop ticking', async t => {
  const suite = tspl(t, { plan: 2 })

  const res = spawnSync('node', ['./test/fixtures/interceptors/retry-event-loop.js'], {
    stdio: 'pipe'
  })

  const output = res.stderr.toString()
  suite.ok(output.includes('UND_ERR_REQ_RETRY'))
  suite.ok(output.includes('RequestRetryError: Request failed'))
})
