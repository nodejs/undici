'use strict'

const { createSecureServer } = require('node:http2')
const { createReadStream, readFileSync } = require('node:fs')
const { once } = require('node:events')
const { Blob } = require('node:buffer')
const { Writable, pipeline, PassThrough, Readable } = require('node:stream')

const { test, plan } = require('tap')
const pem = require('https-pem')

const { Client } = require('..')

plan(14)

test('Should support H2 connection', async t => {
  const body = []
  const server = createSecureServer(pem)

  server.on('stream', (stream, headers) => {
    t.equal(headers['x-my-header'], 'foo')
    t.equal(headers[':method'], 'GET')
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
    }
  })

  t.plan(6)
  t.teardown(server.close.bind(server))
  t.teardown(client.close.bind(client))

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
  t.equal(response.statusCode, 200)
  t.equal(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.equal(response.headers['x-custom-h2'], 'hello')
  t.equal(Buffer.concat(body).toString('utf8'), 'hello h2!')
})

test('Should throw if bad allowH2 has been pased', async t => {
  try {
    // eslint-disable-next-line
    new Client('https://localhost:1000', {
      allowH2: 'true'
    })
    t.fail()
  } catch (error) {
    t.equal(error.message, 'allowH2 must be a valid boolean value')
  }
})

test('Request should fail if allowH2 is false and server advertises h2 only', async t => {
  const server = createSecureServer({
    ...pem,
    allowHTTP1: false,
    ALPNProtocols: ['http/1.1']
  }, (req, res) => {
    t.fail('Should not create a valid h2 stream')
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    allowH2: false,
    connect: {
      rejectUnauthorized: false
    }
  })

  t.teardown(server.close.bind(server))
  t.teardown(client.close.bind(client))

  const response = await client.request({
    path: '/',
    method: 'GET',
    headers: {
      'x-my-header': 'foo'
    }
  })

  t.equal(response.statusCode, 403)
})

test('Should handle h2 continue', async t => {
  const requestBody = []
  const server = createSecureServer(pem, () => {})
  const responseBody = []

  server.on('checkContinue', (request, response) => {
    t.equal(request.headers.expect, '100-continue')
    t.equal(request.headers['x-my-header'], 'foo')
    t.equal(request.headers[':method'], 'POST')
    response.writeContinue()

    request.on('data', chunk => requestBody.push(chunk))

    response.writeHead(200, {
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': 'foo'
    })
    response.end('hello h2!')
  })

  t.plan(7)

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    expectContinue: true
  })

  t.teardown(server.close.bind(server))
  t.teardown(client.close.bind(client))

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

  t.equal(response.statusCode, 200)
  t.equal(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.equal(response.headers['x-custom-h2'], 'foo')
  t.equal(Buffer.concat(responseBody).toString('utf-8'), 'hello h2!')
})

test('Dispatcher#Stream', t => {
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

  t.plan(4)

  server.listen(0, async () => {
    const client = new Client(`https://localhost:${server.address().port}`, {
      connect: {
        rejectUnauthorized: false
      }
    })

    t.teardown(server.close.bind(server))
    t.teardown(client.close.bind(client))

    await client.stream(
      { path: '/', opaque: { bufs }, method: 'POST', body: expectedBody },
      ({ statusCode, headers, opaque: { bufs } }) => {
        t.equal(statusCode, 200)
        t.equal(headers['x-custom'], 'custom-header')

        return new Writable({
          write (chunk, _encoding, cb) {
            bufs.push(chunk)
            cb()
          }
        })
      }
    )

    t.equal(Buffer.concat(bufs).toString('utf-8'), 'hello h2!')
    t.equal(requestBody, expectedBody)
  })
})

test('Dispatcher#Pipeline', t => {
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

  t.plan(5)

  server.listen(0, () => {
    const client = new Client(`https://localhost:${server.address().port}`, {
      connect: {
        rejectUnauthorized: false
      }
    })

    t.teardown(server.close.bind(server))
    t.teardown(client.close.bind(client))

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
          t.equal(statusCode, 200)
          t.equal(headers['x-custom'], 'custom-header')

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
        t.error(err)
        t.equal(Buffer.concat(bufs).toString('utf-8'), 'hello h2!')
        t.equal(requestBody, expectedBody)
      }
    )
  })
})

test('Dispatcher#Connect', t => {
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

  t.plan(6)

  server.listen(0, () => {
    const client = new Client(`https://localhost:${server.address().port}`, {
      connect: {
        rejectUnauthorized: false
      }
    })

    t.teardown(server.close.bind(server))
    t.teardown(client.close.bind(client))

    let result = ''
    client.connect({ path: '/' }, (err, { socket }) => {
      t.error(err)
      socket.on('data', chunk => {
        result += chunk
      })
      socket.on('response', headers => {
        t.equal(headers[':status'], 200)
        t.equal(headers['x-custom'], 'custom-header')
        t.notOk(socket.closed)
      })

      socket.once('end', () => {
        t.equal(requestBody, expectedBody)
        t.equal(result, 'hello h2!')
      })
      socket.end(expectedBody)
    })
  })
})

test('Dispatcher#Upgrade', t => {
  const server = createSecureServer(pem)

  server.on('stream', async (stream, headers) => {
    stream.end()
  })

  t.plan(1)

  server.listen(0, async () => {
    const client = new Client(`https://localhost:${server.address().port}`, {
      connect: {
        rejectUnauthorized: false
      }
    })

    t.teardown(server.close.bind(server))
    t.teardown(client.close.bind(client))

    try {
      await client.upgrade({ path: '/' })
    } catch (error) {
      t.equal(error.message, 'Upgrade not supported for H2')
    }
  })
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
    }
  })

  t.plan(3)
  t.teardown(server.close.bind(server))

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

  t.equal(results[0].status, 'rejected')
  t.equal(results[1].status, 'rejected')
  t.equal(results[2].status, 'rejected')
})

test('Should handle h2 request with body (string or buffer) - dispatch', t => {
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

  t.plan(7)

  server.listen(0, () => {
    const client = new Client(`https://localhost:${server.address().port}`, {
      connect: {
        rejectUnauthorized: false
      }
    })

    t.teardown(server.close.bind(server))
    t.teardown(client.close.bind(client))

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
          t.ok(true)
        },
        onError (err) {
          t.error(err)
        },
        onHeaders (statusCode, headers) {
          t.equal(statusCode, 200)
          t.equal(headers['content-type'], 'text/plain; charset=utf-8')
          t.equal(headers['x-custom-h2'], 'foo')
        },
        onData (chunk) {
          response.push(chunk)
        },
        onBodySent (body) {
          t.equal(body.toString('utf-8'), expectedBody)
        },
        onComplete () {
          t.equal(Buffer.concat(response).toString('utf-8'), 'hello h2!')
          t.equal(
            Buffer.concat(requestBody).toString('utf-8'),
            'hello from client!'
          )
        }
      }
    )
  })
})

test('Should handle h2 request with body (stream)', async t => {
  const server = createSecureServer(pem)
  const expectedBody = readFileSync(__filename, 'utf-8')
  const stream = createReadStream(__filename)
  const requestChunks = []
  const responseBody = []

  server.on('stream', async (stream, headers) => {
    t.equal(headers[':method'], 'PUT')
    t.equal(headers[':path'], '/')
    t.equal(headers[':scheme'], 'https')

    stream.on('data', chunk => requestChunks.push(chunk))

    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': headers['x-my-header'],
      ':status': 200
    })

    stream.end('hello h2!')
  })

  t.plan(8)

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    }
  })

  t.teardown(server.close.bind(server))
  t.teardown(client.close.bind(client))

  const response = await client.request({
    path: '/',
    method: 'PUT',
    headers: {
      'x-my-header': 'foo'
    },
    body: stream
  })

  response.body.on('data', chunk => {
    responseBody.push(chunk)
  })

  await once(response.body, 'end')

  t.equal(response.statusCode, 200)
  t.equal(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.equal(response.headers['x-custom-h2'], 'foo')
  t.equal(Buffer.concat(responseBody).toString('utf-8'), 'hello h2!')
  t.equal(Buffer.concat(requestChunks).toString('utf-8'), expectedBody)
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
    t.equal(headers[':method'], 'POST')
    t.equal(headers[':path'], '/')
    t.equal(headers[':scheme'], 'https')

    stream.on('data', chunk => requestChunks.push(chunk))

    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': headers['x-my-header'],
      ':status': 200
    })

    stream.end('hello h2!')
  })

  t.plan(8)

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    }
  })

  t.teardown(server.close.bind(server))
  t.teardown(client.close.bind(client))

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

  t.equal(response.statusCode, 200)
  t.equal(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.equal(response.headers['x-custom-h2'], 'foo')
  t.equal(Buffer.concat(responseBody).toString('utf-8'), 'hello h2!')
  t.equal(Buffer.concat(requestChunks).toString('utf-8'), expectedBody)
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
    t.equal(headers[':method'], 'POST')
    t.equal(headers[':path'], '/')
    t.equal(headers[':scheme'], 'https')

    stream.on('data', chunk => requestChunks.push(chunk))

    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': headers['x-my-header'],
      ':status': 200
    })

    stream.end('hello h2!')
  })

  t.plan(8)

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    }
  })

  t.teardown(server.close.bind(server))
  t.teardown(client.close.bind(client))

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

  t.equal(response.statusCode, 200)
  t.equal(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.equal(response.headers['x-custom-h2'], 'foo')
  t.equal(Buffer.concat(responseBody).toString('utf-8'), 'hello h2!')
  t.equal(Buffer.concat(requestChunks).toString('utf-8'), expectedBody)
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
      t.equal(headers[':method'], 'POST')
      t.equal(headers[':path'], '/')
      t.equal(headers[':scheme'], 'https')

      stream.on('data', chunk => requestChunks.push(chunk))

      stream.respond({
        'content-type': 'text/plain; charset=utf-8',
        'x-custom-h2': headers['x-my-header'],
        ':status': 200
      })

      stream.end('hello h2!')
    })

    t.plan(8)

    server.listen(0)
    await once(server, 'listening')

    const client = new Client(`https://localhost:${server.address().port}`, {
      connect: {
        rejectUnauthorized: false
      }
    })

    t.teardown(server.close.bind(server))
    t.teardown(client.close.bind(client))

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

    t.equal(response.statusCode, 200)
    t.equal(response.headers['content-type'], 'text/plain; charset=utf-8')
    t.equal(response.headers['x-custom-h2'], 'foo')
    t.equal(Buffer.concat(responseBody).toString('utf-8'), 'hello h2!')
    t.equal(Buffer.concat(requestChunks).toString('utf-8'), expectedBody)
  }
)
