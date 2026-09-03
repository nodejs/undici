'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')

const { Client, interceptors } = require('../..')
const { retry } = interceptors

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
  const reuestOptions = {
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

  const response = await client.request(reuestOptions)

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

test('Should reject initial 206 partial content with mismatched content-length', async t => {
  t = tspl(t, { plan: 3 })

  let x = 0
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    if (x === 0) {
      t.strictEqual(req.headers.range, 'bytes=0-99')
      res.statusCode = 206
      res.setHeader('content-range', 'bytes 0-99/300')
      res.setHeader('content-length', '300')
      res.end('1'.repeat(99))
      res.socket?.destroy()
    } else if (x === 1) {
      res.statusCode = 206
      res.setHeader('content-range', 'bytes 99-99/300')
      res.setHeader('content-length', '1')
      res.end('1')
    }
    x++
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

  await t.rejects(async () => {
    const response = await client.request({
      method: 'GET',
      path: '/',
      headers: {
        range: 'bytes=0-99'
      }
    })
    await response.body.text()
  }, {
    name: 'RequestRetryError',
    code: 'UND_ERR_REQ_RETRY',
    message: 'Content-Length mismatch'
  })
  t.strictEqual(x, 1)
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
      res.setHeader('content-range', 'bytes 3-5/6')
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

test('#4970 - Should reject resumed partial content when body exceeds Content-Range', async t => {
  t = tspl(t, { plan: 5 })

  let x = 0
  const injectedResponse = 'HTTP/1.1 302 Found\r\nLocation: http://evil.com\r\nContent-Length: 0\r\n\r\n'
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    if (x === 0) {
      t.ok(true, 'pass')
      res.setHeader('content-length', '5')
      res.setHeader('etag', '123')
      res.write('use')
      setTimeout(() => {
        res.destroy()
      }, 1e2)
    } else if (x === 1) {
      t.deepStrictEqual(req.headers.range, 'bytes=3-4')
      t.deepStrictEqual(req.headers['if-match'], '123')
      res.statusCode = 206
      res.setHeader('etag', '123')
      res.setHeader('content-range', 'bytes 3-4/5')
      res.end(`r1${injectedResponse}`)
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

  const response = await client.request(requestOptions)
  t.strictEqual(response.statusCode, 200)
  await t.rejects(response.body.text(), {
    name: 'RequestRetryError',
    code: 'UND_ERR_REQ_RETRY',
    message: 'Content-Length mismatch'
  })
})

test('#3900615 - Should reject a resumed response that exceeds an error response content-length', async t => {
  t = tspl(t, { plan: 3 })

  let x = 0
  let retries = 0
  const injectedResponse = 'HTTP/1.1 302 Found\r\nLocation: http://evil.com\r\nContent-Length: 0\r\n\r\n'
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    if (x === 0) {
      res.statusCode = 404
      res.setHeader('content-length', '2')
      res.end('1', () => res.destroy())
    } else if (x === 1) {
      t.strictEqual(req.headers.range, 'bytes=1-1')
      res.statusCode = 206
      res.setHeader('connection', 'close')
      res.setHeader('content-range', `bytes 1-${injectedResponse.length + 1}/${injectedResponse.length + 2}`)
      res.end(`2${injectedResponse}`)
    }
    x++
  })

  server.listen(0)

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(retry())

  after(async () => {
    await client.destroy()
    server.closeAllConnections()
    server.close()

    await once(server, 'close')
  })

  const response = await client.request({
    method: 'GET',
    path: '/',
    retryOptions: {
      retry: (err, _context, done) => {
        if (err.message.includes('other side closed') && retries++ === 0) {
          done(null)
          return
        }

        done(err)
      }
    }
  })
  t.strictEqual(response.statusCode, 404)
  await t.rejects(response.body.text(), {
    name: 'RequestRetryError',
    code: 'UND_ERR_REQ_RETRY',
    message: 'Content-Range mismatch'
  })
})

test('#3900104 - Should not resume a 206 response without a usable content-range', async t => {
  t = tspl(t, { plan: 4 })

  let x = 0
  const server = createServer({ joinDuplicateHeaders: true }, (_req, res) => {
    t.strictEqual(x, 0, 'must not retry an uncheckpointed partial response')
    res.statusCode = 206
    res.setHeader('content-length', '2')
    res.setHeader('content-range', 'bytes 0-999')
    res.write('1', () => res.destroy())
    x++
  })

  server.listen(0)

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(retry())

  after(async () => {
    await client.destroy()
    server.close()

    await once(server, 'close')
  })

  const response = await client.request({ method: 'GET', path: '/' })
  t.strictEqual(response.statusCode, 206)
  await t.rejects(response.body.text(), {
    name: 'SocketError',
    code: 'UND_ERR_SOCKET',
    message: 'other side closed'
  })
  t.strictEqual(x, 1)
})

test('Should not reject a HEAD response with content-length', async t => {
  t = tspl(t, { plan: 3 })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-length', '1234')
    res.end()
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

  const response = await client.request({ method: 'HEAD', path: '/' })
  t.strictEqual(response.statusCode, 200)
  t.strictEqual(response.headers['content-length'], '1234')
  t.strictEqual(await response.body.text(), '')
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
