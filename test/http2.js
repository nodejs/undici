'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createSecureServer } = require('node:http2')
const { createReadStream, readFileSync } = require('node:fs')
const { once } = require('node:events')
const { Blob } = require('node:buffer')
const { Writable, pipeline, PassThrough, Readable } = require('node:stream')

const pem = require('https-pem')

const { Client, Agent } = require('..')

const isGreaterThanv20 = process.versions.node.split('.').map(Number)[0] >= 20

test('Should support H2 connection', async t => {
  const body = []
  const server = createSecureServer(pem)

  server.on('stream', (stream, headers, _flags, rawHeaders) => {
    t.strictEqual(headers['x-my-header'], 'foo')
    t.strictEqual(headers[':method'], 'GET')
    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': 'hello',
      ':status': 200
    })
    stream.end('hello h2!')
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  t = tspl(t, { plan: 6 })
  after(() => server.close())
  after(() => client.close())

  const response = await client.request({
    path: '/',
    method: 'GET',
    headers: {
      'x-my-header': 'foo'
    }
  })

  response.body.on('data', chunk => {
    body.push(chunk)
  })

  await once(response.body, 'end')
  t.strictEqual(response.statusCode, 200)
  t.strictEqual(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.strictEqual(response.headers['x-custom-h2'], 'hello')
  t.strictEqual(Buffer.concat(body).toString('utf8'), 'hello h2!')
})

test('Should support H2 connection(multiple requests)', async t => {
  const server = createSecureServer(pem)

  server.on('stream', async (stream, headers, _flags, rawHeaders) => {
    t.strictEqual(headers['x-my-header'], 'foo')
    t.strictEqual(headers[':method'], 'POST')
    const reqData = []
    stream.on('data', chunk => reqData.push(chunk.toString()))
    await once(stream, 'end')
    const reqBody = reqData.join('')
    t.strictEqual(reqBody.length > 0, true)
    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': 'hello',
      ':status': 200
    })
    stream.end(`hello h2! ${reqBody}`)
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  t = tspl(t, { plan: 21 })
  after(() => server.close())
  after(() => client.close())

  for (let i = 0; i < 3; i++) {
    const sendBody = `seq ${i}`
    const body = []
    const response = await client.request({
      path: '/',
      method: 'POST',
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'x-my-header': 'foo'
      },
      body: Readable.from(sendBody)
    })

    response.body.on('data', chunk => {
      body.push(chunk)
    })

    await once(response.body, 'end')
    t.strictEqual(response.statusCode, 200)
    t.strictEqual(response.headers['content-type'], 'text/plain; charset=utf-8')
    t.strictEqual(response.headers['x-custom-h2'], 'hello')
    t.strictEqual(Buffer.concat(body).toString('utf8'), `hello h2! ${sendBody}`)
  }
})

test('Should support H2 connection (headers as array)', async t => {
  const body = []
  const server = createSecureServer(pem)

  server.on('stream', (stream, headers) => {
    t.strictEqual(headers['x-my-header'], 'foo')
    t.strictEqual(headers['x-my-drink'], 'coffee,tea')
    t.strictEqual(headers[':method'], 'GET')
    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': 'hello',
      ':status': 200
    })
    stream.end('hello h2!')
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  t = tspl(t, { plan: 7 })
  after(() => server.close())
  after(() => client.close())

  const response = await client.request({
    path: '/',
    method: 'GET',
    headers: ['x-my-header', 'foo', 'x-my-drink', ['coffee', 'tea']]
  })

  response.body.on('data', chunk => {
    body.push(chunk)
  })

  await once(response.body, 'end')
  t.strictEqual(response.statusCode, 200)
  t.strictEqual(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.strictEqual(response.headers['x-custom-h2'], 'hello')
  t.strictEqual(Buffer.concat(body).toString('utf8'), 'hello h2!')
})

test('Should support H2 connection(POST Buffer)', async t => {
  const server = createSecureServer({ ...pem, allowHTTP1: false })

  server.on('stream', async (stream, headers, _flags, rawHeaders) => {
    t.strictEqual(headers[':method'], 'POST')
    const reqData = []
    stream.on('data', chunk => reqData.push(chunk.toString()))
    await once(stream, 'end')
    t.strictEqual(reqData.join(''), 'hello!')
    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': 'hello',
      ':status': 200
    })
    stream.end('hello h2!')
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  t = tspl(t, { plan: 6 })
  after(() => server.close())
  after(() => client.close())

  const sendBody = 'hello!'
  const body = []
  const response = await client.request({
    path: '/',
    method: 'POST',
    body: sendBody
  })

  response.body.on('data', chunk => {
    body.push(chunk)
  })

  await once(response.body, 'end')
  t.strictEqual(response.statusCode, 200)
  t.strictEqual(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.strictEqual(response.headers['x-custom-h2'], 'hello')
  t.strictEqual(Buffer.concat(body).toString('utf8'), 'hello h2!')
})

test('Should support H2 GOAWAY (server-side)', async t => {
  const body = []
  const server = createSecureServer(pem)

  server.on('stream', (stream, headers) => {
    t.strictEqual(headers['x-my-header'], 'foo')
    t.strictEqual(headers[':method'], 'GET')
    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': 'hello',
      ':status': 200
    })
    stream.end('hello h2!')
  })

  server.on('session', session => {
    setTimeout(() => {
      session.goaway(204)
    }, 1000)
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  t = tspl(t, { plan: 9 })
  after(() => server.close())
  after(() => client.close())

  const response = await client.request({
    path: '/',
    method: 'GET',
    headers: {
      'x-my-header': 'foo'
    }
  })

  response.body.on('data', chunk => {
    body.push(chunk)
  })

  await once(response.body, 'end')
  t.strictEqual(response.statusCode, 200)
  t.strictEqual(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.strictEqual(response.headers['x-custom-h2'], 'hello')
  t.strictEqual(Buffer.concat(body).toString('utf8'), 'hello h2!')

  const [url, disconnectClient, err] = await once(client, 'disconnect')

  t.ok(url instanceof URL)
  t.deepStrictEqual(disconnectClient, [client])
  t.strictEqual(err.message, 'HTTP/2: "GOAWAY" frame received with code 204')
})

test('Should throw if bad allowH2 has been passed', async t => {
  t = tspl(t, { plan: 1 })

  try {
    // eslint-disable-next-line
    new Client('https://localhost:1000', {
      allowH2: 'true'
    })
    t.fail()
  } catch (error) {
    t.strictEqual(error.message, 'allowH2 must be a valid boolean value')
  }
})

test('Should throw if bad maxConcurrentStreams has been passed', async t => {
  t = tspl(t, { plan: 2 })

  try {
    // eslint-disable-next-line
    new Client('https://localhost:1000', {
      allowH2: true,
      maxConcurrentStreams: {}
    })
    t.fail()
  } catch (error) {
    t.strictEqual(
      error.message,
      'maxConcurrentStreams must be a positive integer, greater than 0'
    )
  }

  try {
    // eslint-disable-next-line
    new Client('https://localhost:1000', {
      allowH2: true,
      maxConcurrentStreams: -1
    })
    t.fail()
  } catch (error) {
    t.strictEqual(
      error.message,
      'maxConcurrentStreams must be a positive integer, greater than 0'
    )
  }

  await t.completed
})

test(
  'Request should fail if allowH2 is false and server advertises h1 only',
  { skip: isGreaterThanv20 },
  async t => {
    t = tspl(t, { plan: 1 })

    const server = createSecureServer(
      {
        ...pem,
        allowHTTP1: false,
        ALPNProtocols: ['http/1.1']
      },
      (req, res) => {
        t.fail('Should not create a valid h2 stream')
      }
    )

    server.listen(0)
    await once(server, 'listening')

    const client = new Client(`https://localhost:${server.address().port}`, {
      allowH2: false,
      connect: {
        rejectUnauthorized: false
      }
    })

    after(() => server.close())
    after(() => client.close())

    const response = await client.request({
      path: '/',
      method: 'GET',
      headers: {
        'x-my-header': 'foo'
      }
    })

    t.strictEqual(response.statusCode, 403)
  }
)

test(
  '[v20] Request should fail if allowH2 is false and server advertises h1 only',
  { skip: !isGreaterThanv20 },
  async t => {
    const server = createSecureServer(
      {
        ...pem,
        allowHTTP1: false,
        ALPNProtocols: ['http/1.1']
      },
      (req, res) => {
        t.fail('Should not create a valid h2 stream')
      }
    )

    server.listen(0)
    await once(server, 'listening')

    const client = new Client(`https://localhost:${server.address().port}`, {
      allowH2: false,
      connect: {
        rejectUnauthorized: false
      }
    })

    after(() => server.close())
    after(() => client.close())
    t = tspl(t, { plan: 2 })

    try {
      await client.request({
        path: '/',
        method: 'GET',
        headers: {
          'x-my-header': 'foo'
        }
      })
    } catch (error) {
      t.strictEqual(
        error.message,
        'Client network socket disconnected before secure TLS connection was established'
      )
      t.strictEqual(error.code, 'ECONNRESET')
    }
  }
)

test('Should handle h2 continue', async t => {
  const requestBody = []
  const server = createSecureServer(pem, () => {})
  const responseBody = []

  server.on('checkContinue', (request, response) => {
    t.strictEqual(request.headers.expect, '100-continue')
    t.strictEqual(request.headers['x-my-header'], 'foo')
    t.strictEqual(request.headers[':method'], 'POST')
    response.writeContinue()

    request.on('data', chunk => requestBody.push(chunk))

    response.writeHead(200, {
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': 'foo'
    })
    response.end('hello h2!')
  })

  t = tspl(t, { plan: 7 })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    expectContinue: true,
    allowH2: true
  })

  after(() => server.close())
  after(() => client.close())

  const response = await client.request({
    path: '/',
    method: 'POST',
    headers: {
      'x-my-header': 'foo'
    },
    expectContinue: true
  })

  response.body.on('data', chunk => {
    responseBody.push(chunk)
  })

  await once(response.body, 'end')

  t.strictEqual(response.statusCode, 200)
  t.strictEqual(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.strictEqual(response.headers['x-custom-h2'], 'foo')
  t.strictEqual(Buffer.concat(responseBody).toString('utf-8'), 'hello h2!')
})

test('Dispatcher#Stream', async t => {
  const server = createSecureServer(pem)
  const expectedBody = 'hello from client!'
  const bufs = []
  let requestBody = ''

  server.on('stream', async (stream, headers) => {
    stream.setEncoding('utf-8')
    stream.on('data', chunk => {
      requestBody += chunk
    })

    stream.respond({ ':status': 200, 'x-custom': 'custom-header' })
    stream.end('hello h2!')
  })

  t = tspl(t, { plan: 4 })

  server.listen(0, async () => {
    const client = new Client(`https://localhost:${server.address().port}`, {
      connect: {
        rejectUnauthorized: false
      },
      allowH2: true
    })

    after(() => server.close())
    after(() => client.close())

    await client.stream(
      { path: '/', opaque: { bufs }, method: 'POST', body: expectedBody },
      ({ statusCode, headers, opaque: { bufs } }) => {
        t.strictEqual(statusCode, 200)
        t.strictEqual(headers['x-custom'], 'custom-header')

        return new Writable({
          write (chunk, _encoding, cb) {
            bufs.push(chunk)
            cb()
          }
        })
      }
    )

    t.strictEqual(Buffer.concat(bufs).toString('utf-8'), 'hello h2!')
    t.strictEqual(requestBody, expectedBody)
  })

  await t.completed
})

test('Dispatcher#Pipeline', async t => {
  const server = createSecureServer(pem)
  const expectedBody = 'hello from client!'
  const bufs = []
  let requestBody = ''

  server.on('stream', async (stream, headers) => {
    stream.setEncoding('utf-8')
    stream.on('data', chunk => {
      requestBody += chunk
    })

    stream.respond({ ':status': 200, 'x-custom': 'custom-header' })
    stream.end('hello h2!')
  })

  t = tspl(t, { plan: 5 })

  server.listen(0, () => {
    const client = new Client(`https://localhost:${server.address().port}`, {
      connect: {
        rejectUnauthorized: false
      },
      allowH2: true
    })

    after(() => server.close())
    after(() => client.close())

    pipeline(
      new Readable({
        read () {
          this.push(Buffer.from(expectedBody))
          this.push(null)
        }
      }),
      client.pipeline(
        { path: '/', method: 'POST', body: expectedBody },
        ({ statusCode, headers, body }) => {
          t.strictEqual(statusCode, 200)
          t.strictEqual(headers['x-custom'], 'custom-header')

          return pipeline(body, new PassThrough(), () => {})
        }
      ),
      new Writable({
        write (chunk, _, cb) {
          bufs.push(chunk)
          cb()
        }
      }),
      err => {
        t.ifError(err)
        t.strictEqual(Buffer.concat(bufs).toString('utf-8'), 'hello h2!')
        t.strictEqual(requestBody, expectedBody)
      }
    )
  })

  await t.completed
})

test('Dispatcher#Connect', async t => {
  const server = createSecureServer(pem)
  const expectedBody = 'hello from client!'
  let requestBody = ''

  server.on('stream', async (stream, headers) => {
    stream.setEncoding('utf-8')
    stream.on('data', chunk => {
      requestBody += chunk
    })

    stream.respond({ ':status': 200, 'x-custom': 'custom-header' })
    stream.end('hello h2!')
  })

  t = tspl(t, { plan: 6 })

  server.listen(0, () => {
    const client = new Client(`https://localhost:${server.address().port}`, {
      connect: {
        rejectUnauthorized: false
      },
      allowH2: true
    })

    after(() => server.close())
    after(() => client.close())

    let result = ''
    client.connect({ path: '/' }, (err, { socket }) => {
      t.ifError(err)
      socket.on('data', chunk => {
        result += chunk
      })
      socket.on('response', headers => {
        t.strictEqual(headers[':status'], 200)
        t.strictEqual(headers['x-custom'], 'custom-header')
        t.strictEqual(socket.closed, false)
      })

      // We need to handle the error event although
      // is not controlled by Undici, the fact that a session
      // is destroyed and destroys subsequent streams, causes
      // unhandled errors to surface if not handling this event.
      socket.on('error', () => {})

      socket.once('end', () => {
        t.strictEqual(requestBody, expectedBody)
        t.strictEqual(result, 'hello h2!')
      })
      socket.end(expectedBody)
    })
  })

  await t.completed
})

test('Dispatcher#Upgrade', async t => {
  const server = createSecureServer(pem)

  server.on('stream', async (stream, headers) => {
    stream.end()
  })

  t = tspl(t, { plan: 1 })

  server.listen(0, async () => {
    const client = new Client(`https://localhost:${server.address().port}`, {
      connect: {
        rejectUnauthorized: false
      },
      allowH2: true
    })

    after(() => server.close())
    after(() => client.close())

    try {
      await client.upgrade({ path: '/' })
    } catch (error) {
      t.strictEqual(error.message, 'Upgrade not supported for H2')
    }
  })

  await t.completed
})

test('Dispatcher#destroy', async t => {
  const promises = []
  const server = createSecureServer(pem)

  server.on('stream', (stream, headers) => {
    setTimeout(stream.end.bind(stream), 1500)
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  t = tspl(t, { plan: 4 })
  after(() => server.close())

  promises.push(
    client.request({
      path: '/',
      method: 'GET',
      headers: {
        'x-my-header': 'foo'
      }
    })
  )

  promises.push(
    client.request({
      path: '/',
      method: 'GET',
      headers: {
        'x-my-header': 'foo'
      }
    })
  )

  promises.push(
    client.request({
      path: '/',
      method: 'GET',
      headers: {
        'x-my-header': 'foo'
      }
    })
  )

  promises.push(
    client.request({
      path: '/',
      method: 'GET',
      headers: {
        'x-my-header': 'foo'
      }
    })
  )

  await client.destroy()

  const results = await Promise.allSettled(promises)

  t.strictEqual(results[0].status, 'rejected')
  t.strictEqual(results[1].status, 'rejected')
  t.strictEqual(results[2].status, 'rejected')
  t.strictEqual(results[3].status, 'rejected')
})

test('Should handle h2 request without body', async t => {
  const server = createSecureServer(pem)
  const expectedBody = ''
  const requestChunks = []
  const responseBody = []

  server.on('stream', async (stream, headers) => {
    t.strictEqual(headers[':method'], 'POST')
    t.strictEqual(headers[':path'], '/')
    t.strictEqual(headers[':scheme'], 'https')

    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': headers['x-my-header'],
      ':status': 200
    })

    for await (const chunk of stream) {
      requestChunks.push(chunk)
    }

    stream.end('hello h2!')
  })

  t = tspl(t, { plan: 9 })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  after(() => server.close())
  after(() => client.close())

  const response = await client.request({
    path: '/',
    method: 'POST',
    headers: {
      'x-my-header': 'foo'
    }
  })

  for await (const chunk of response.body) {
    responseBody.push(chunk)
  }

  t.strictEqual(response.statusCode, 200)
  t.strictEqual(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.strictEqual(response.headers['x-custom-h2'], 'foo')
  t.strictEqual(Buffer.concat(responseBody).toString('utf-8'), 'hello h2!')
  t.strictEqual(requestChunks.length, 0)
  t.strictEqual(Buffer.concat(requestChunks).toString('utf-8'), expectedBody)
})

test('Should handle h2 request with body (string or buffer) - dispatch', async t => {
  const server = createSecureServer(pem)
  const expectedBody = 'hello from client!'
  const response = []
  const requestBody = []

  server.on('stream', async (stream, headers) => {
    stream.on('data', chunk => requestBody.push(chunk))

    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': headers['x-my-header'],
      ':status': 200
    })

    stream.end('hello h2!')
  })

  t = tspl(t, { plan: 7 })

  server.listen(0, () => {
    const client = new Client(`https://localhost:${server.address().port}`, {
      connect: {
        rejectUnauthorized: false
      },
      allowH2: true
    })

    after(() => server.close())
    after(() => client.close())

    client.dispatch(
      {
        path: '/',
        method: 'POST',
        headers: {
          'x-my-header': 'foo',
          'content-type': 'text/plain'
        },
        body: expectedBody
      },
      {
        onConnect () {
          t.ok(true, 'pass')
        },
        onError (err) {
          t.ifError(err)
        },
        onHeaders (statusCode, headers) {
          t.strictEqual(statusCode, 200)
          t.strictEqual(headers[0].toString('utf-8'), 'content-type')
          t.strictEqual(headers[1].toString('utf-8'), 'text/plain; charset=utf-8')
          t.strictEqual(headers[2].toString('utf-8'), 'x-custom-h2')
          t.strictEqual(headers[3].toString('utf-8'), 'foo')
        },
        onData (chunk) {
          response.push(chunk)
        },
        onBodySent (body) {
          t.strictEqual(body.toString('utf-8'), expectedBody)
        },
        onComplete () {
          t.strictEqual(Buffer.concat(response).toString('utf-8'), 'hello h2!')
          t.strictEqual(
            Buffer.concat(requestBody).toString('utf-8'),
            'hello from client!'
          )
        }
      }
    )
  })

  await t.completed
})

test('Should handle h2 request with body (stream)', async t => {
  const server = createSecureServer(pem)
  const expectedBody = readFileSync(__filename, 'utf-8')
  const stream = createReadStream(__filename)
  const requestChunks = []
  const responseBody = []

  server.on('stream', async (stream, headers) => {
    t.strictEqual(headers[':method'], 'PUT')
    t.strictEqual(headers[':path'], '/')
    t.strictEqual(headers[':scheme'], 'https')

    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': headers['x-my-header'],
      ':status': 200
    })

    for await (const chunk of stream) {
      requestChunks.push(chunk)
    }

    stream.end('hello h2!')
  })

  t = tspl(t, { plan: 8 })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  after(() => server.close())
  after(() => client.close())

  const response = await client.request({
    path: '/',
    method: 'PUT',
    headers: {
      'x-my-header': 'foo'
    },
    body: stream
  })

  for await (const chunk of response.body) {
    responseBody.push(chunk)
  }

  t.strictEqual(response.statusCode, 200)
  t.strictEqual(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.strictEqual(response.headers['x-custom-h2'], 'foo')
  t.strictEqual(Buffer.concat(responseBody).toString('utf-8'), 'hello h2!')
  t.strictEqual(Buffer.concat(requestChunks).toString('utf-8'), expectedBody)
})

test('Should handle h2 request with body (iterable)', async t => {
  const server = createSecureServer(pem)
  const expectedBody = 'hello'
  const requestChunks = []
  const responseBody = []
  const iterableBody = {
    [Symbol.iterator]: function * () {
      const end = expectedBody.length - 1
      for (let i = 0; i < end + 1; i++) {
        yield expectedBody[i]
      }

      return expectedBody[end]
    }
  }

  server.on('stream', async (stream, headers) => {
    t.strictEqual(headers[':method'], 'POST')
    t.strictEqual(headers[':path'], '/')
    t.strictEqual(headers[':scheme'], 'https')

    stream.on('data', chunk => requestChunks.push(chunk))

    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': headers['x-my-header'],
      ':status': 200
    })

    stream.end('hello h2!')
  })

  t = tspl(t, { plan: 8 })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  after(() => server.close())
  after(() => client.close())

  const response = await client.request({
    path: '/',
    method: 'POST',
    headers: {
      'x-my-header': 'foo'
    },
    body: iterableBody
  })

  response.body.on('data', chunk => {
    responseBody.push(chunk)
  })

  await once(response.body, 'end')

  t.strictEqual(response.statusCode, 200)
  t.strictEqual(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.strictEqual(response.headers['x-custom-h2'], 'foo')
  t.strictEqual(Buffer.concat(responseBody).toString('utf-8'), 'hello h2!')
  t.strictEqual(Buffer.concat(requestChunks).toString('utf-8'), expectedBody)
})

test('Should handle h2 request with body (Blob)', { skip: !Blob }, async t => {
  const server = createSecureServer(pem)
  const expectedBody = 'asd'
  const requestChunks = []
  const responseBody = []
  const body = new Blob(['asd'], {
    type: 'application/json'
  })

  server.on('stream', async (stream, headers) => {
    t.strictEqual(headers[':method'], 'POST')
    t.strictEqual(headers[':path'], '/')
    t.strictEqual(headers[':scheme'], 'https')

    stream.on('data', chunk => requestChunks.push(chunk))

    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': headers['x-my-header'],
      ':status': 200
    })

    stream.end('hello h2!')
  })

  t = tspl(t, { plan: 8 })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  after(() => server.close())
  after(() => client.close())

  const response = await client.request({
    path: '/',
    method: 'POST',
    headers: {
      'x-my-header': 'foo'
    },
    body
  })

  response.body.on('data', chunk => {
    responseBody.push(chunk)
  })

  await once(response.body, 'end')

  t.strictEqual(response.statusCode, 200)
  t.strictEqual(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.strictEqual(response.headers['x-custom-h2'], 'foo')
  t.strictEqual(Buffer.concat(responseBody).toString('utf-8'), 'hello h2!')
  t.strictEqual(Buffer.concat(requestChunks).toString('utf-8'), expectedBody)
})

test(
  'Should handle h2 request with body (Blob:ArrayBuffer)',
  { skip: !Blob },
  async t => {
    const server = createSecureServer(pem)
    const expectedBody = 'hello'
    const requestChunks = []
    const responseBody = []
    const buf = Buffer.from(expectedBody)
    const body = new ArrayBuffer(buf.byteLength)

    buf.copy(new Uint8Array(body))

    server.on('stream', async (stream, headers) => {
      t.strictEqual(headers[':method'], 'POST')
      t.strictEqual(headers[':path'], '/')
      t.strictEqual(headers[':scheme'], 'https')

      stream.on('data', chunk => requestChunks.push(chunk))

      stream.respond({
        'content-type': 'text/plain; charset=utf-8',
        'x-custom-h2': headers['x-my-header'],
        ':status': 200
      })

      stream.end('hello h2!')
    })

    t = tspl(t, { plan: 8 })

    server.listen(0)
    await once(server, 'listening')

    const client = new Client(`https://localhost:${server.address().port}`, {
      connect: {
        rejectUnauthorized: false
      },
      allowH2: true
    })

    after(() => server.close())
    after(() => client.close())

    const response = await client.request({
      path: '/',
      method: 'POST',
      headers: {
        'x-my-header': 'foo'
      },
      body
    })

    response.body.on('data', chunk => {
      responseBody.push(chunk)
    })

    await once(response.body, 'end')

    t.strictEqual(response.statusCode, 200)
    t.strictEqual(response.headers['content-type'], 'text/plain; charset=utf-8')
    t.strictEqual(response.headers['x-custom-h2'], 'foo')
    t.strictEqual(Buffer.concat(responseBody).toString('utf-8'), 'hello h2!')
    t.strictEqual(Buffer.concat(requestChunks).toString('utf-8'), expectedBody)
  }
)

test('Agent should support H2 connection', async t => {
  const body = []
  const server = createSecureServer(pem)

  server.on('stream', (stream, headers) => {
    t.strictEqual(headers['x-my-header'], 'foo')
    t.strictEqual(headers[':method'], 'GET')
    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': 'hello',
      ':status': 200
    })
    stream.end('hello h2!')
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Agent({
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  t = tspl(t, { plan: 6 })
  after(() => server.close())
  after(() => client.close())

  const response = await client.request({
    origin: `https://localhost:${server.address().port}`,
    path: '/',
    method: 'GET',
    headers: {
      'x-my-header': 'foo'
    }
  })

  response.body.on('data', chunk => {
    body.push(chunk)
  })

  await once(response.body, 'end')
  t.strictEqual(response.statusCode, 200)
  t.strictEqual(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.strictEqual(response.headers['x-custom-h2'], 'hello')
  t.strictEqual(Buffer.concat(body).toString('utf8'), 'hello h2!')
})

test(
  'Should provide pseudo-headers in proper order',
  async t => {
    t = tspl(t, { plan: 2 })

    const server = createSecureServer(pem)
    server.on('stream', (stream, _headers, _flags, rawHeaders) => {
      t.deepStrictEqual(rawHeaders, [
        ':authority',
        `localhost:${server.address().port}`,
        ':method',
        'GET',
        ':path',
        '/',
        ':scheme',
        'https'
      ])

      stream.respond({
        'content-type': 'text/plain; charset=utf-8',
        ':status': 200
      })
      stream.end()
    })

    server.listen(0)
    await once(server, 'listening')

    const client = new Client(`https://localhost:${server.address().port}`, {
      connect: {
        rejectUnauthorized: false
      },
      allowH2: true
    })

    after(() => server.close())
    after(() => client.close())

    const response = await client.request({
      path: '/',
      method: 'GET'
    })

    t.strictEqual(response.statusCode, 200)

    await t.complete
  }
)

test('The h2 pseudo-headers is not included in the headers', async t => {
  const server = createSecureServer(pem)

  server.on('stream', (stream, headers) => {
    stream.respond({
      ':status': 200
    })
    stream.end('hello h2!')
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  t = tspl(t, { plan: 2 })
  after(() => server.close())
  after(() => client.close())

  const response = await client.request({
    path: '/',
    method: 'GET'
  })

  await response.body.text()

  t.strictEqual(response.statusCode, 200)
  t.strictEqual(response.headers[':status'], undefined)
})

test('Should throw informational error on half-closed streams (remote)', async t => {
  const server = createSecureServer(pem)

  server.on('stream', (stream, headers) => {
    stream.destroy()
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  t = tspl(t, { plan: 2 })
  after(() => server.close())
  after(() => client.close())

  await client.request({
    path: '/',
    method: 'GET'
  }).catch(err => {
    t.strictEqual(err.message, 'HTTP/2: stream half-closed (remote)')
    t.strictEqual(err.code, 'UND_ERR_INFO')
  })
})

test('#2364 - Concurrent aborts', async t => {
  const server = createSecureServer(pem)

  server.on('stream', (stream, headers, _flags, rawHeaders) => {
    t.strictEqual(headers['x-my-header'], 'foo')
    t.strictEqual(headers[':method'], 'GET')
    setTimeout(() => {
      stream.respond({
        'content-type': 'text/plain; charset=utf-8',
        'x-custom-h2': 'hello',
        ':status': 200
      })
      stream.end('hello h2!')
    }, 100)
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  t = tspl(t, { plan: 18 })
  after(() => server.close())
  after(() => client.close())
  const controller = new AbortController()

  client.request({
    path: '/',
    method: 'GET',
    headers: {
      'x-my-header': 'foo'
    }
  }, (err, response) => {
    t.ifError(err)
    t.strictEqual(response.headers['content-type'], 'text/plain; charset=utf-8')
    t.strictEqual(response.headers['x-custom-h2'], 'hello')
    t.strictEqual(response.statusCode, 200)
    response.body.dump()
  })

  client.request({
    path: '/',
    method: 'GET',
    headers: {
      'x-my-header': 'foo'
    },
    signal: controller.signal
  }, (err, response) => {
    t.strictEqual(err.name, 'AbortError')
  })

  client.request({
    path: '/',
    method: 'GET',
    headers: {
      'x-my-header': 'foo'
    }
  }, (err, response) => {
    t.ifError(err)
    t.strictEqual(response.headers['content-type'], 'text/plain; charset=utf-8')
    t.strictEqual(response.headers['x-custom-h2'], 'hello')
    t.strictEqual(response.statusCode, 200)
  })

  client.request({
    path: '/',
    method: 'GET',
    headers: {
      'x-my-header': 'foo'
    },
    signal: controller.signal
  }, (err, response) => {
    t.strictEqual(err.name, 'AbortError')
  })

  controller.abort()

  await t.completed
})
