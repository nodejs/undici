'use strict'

const { createSecureServer } = require('node:http2')
const { createReadStream, readFileSync } = require('node:fs')
const { once } = require('node:events')
const { Blob } = require('node:buffer')
const { Readable } = require('node:stream')

const { test } = require('node:test')
const { tspl } = require('@matteo.collina/tspl')
const pem = require('https-pem')

const { Client, fetch, Headers } = require('../..')

const { closeClientAndServerAsPromise } = require('../utils/node-http')

test('[Fetch] Issue#2311', async (t) => {
  const expectedBody = 'hello from client!'

  const server = createSecureServer(pem, async (req, res) => {
    let body = ''

    req.setEncoding('utf8')

    res.writeHead(200, {
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': req.headers['x-my-header']
    })

    for await (const chunk of req) {
      body += chunk
    }

    res.end(body)
  })

  const { strictEqual } = tspl(t, { plan: 2 })

  server.listen()
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  const response = await fetch(
    `https://localhost:${server.address().port}/`,
    // Needs to be passed to disable the reject unauthorized
    {
      method: 'POST',
      dispatcher: client,
      headers: {
        'x-my-header': 'foo',
        'content-type': 'text-plain'
      },
      body: expectedBody
    }
  )

  const responseBody = await response.text()

  t.after(closeClientAndServerAsPromise(client, server))

  strictEqual(responseBody, expectedBody)
  strictEqual(response.headers.get('x-custom-h2'), 'foo')
})

test('[Fetch] Simple GET with h2', async (t) => {
  const server = createSecureServer(pem)
  const expectedRequestBody = 'hello h2!'

  server.on('stream', async (stream, headers) => {
    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': headers['x-my-header'],
      'x-method': headers[':method'],
      ':status': 200
    })

    stream.end(expectedRequestBody)
  })

  const { strictEqual, throws } = tspl(t, { plan: 5 })

  server.listen()
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  const response = await fetch(
    `https://localhost:${server.address().port}/`,
    // Needs to be passed to disable the reject unauthorized
    {
      method: 'GET',
      dispatcher: client,
      headers: {
        'x-my-header': 'foo',
        'content-type': 'text-plain'
      }
    }
  )

  const responseBody = await response.text()

  t.after(closeClientAndServerAsPromise(client, server))

  strictEqual(responseBody, expectedRequestBody)
  strictEqual(response.headers.get('x-method'), 'GET')
  strictEqual(response.headers.get('x-custom-h2'), 'foo')
  // https://github.com/nodejs/undici/issues/2415
  throws(() => {
    response.headers.get(':status')
  }, TypeError)

  // See https://fetch.spec.whatwg.org/#concept-response-status-message
  strictEqual(response.statusText, '')
})

test('[Fetch] Should handle h2 request with body (string or buffer)', async (t) => {
  const server = createSecureServer(pem)
  const expectedBody = 'hello from client!'
  const expectedRequestBody = 'hello h2!'
  const requestBody = []

  server.on('stream', async (stream, headers) => {
    stream.on('data', chunk => requestBody.push(chunk))

    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': headers['x-my-header'],
      ':status': 200
    })

    stream.end(expectedRequestBody)
  })

  const { strictEqual } = tspl(t, { plan: 2 })

  server.listen()
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  const response = await fetch(
    `https://localhost:${server.address().port}/`,
    // Needs to be passed to disable the reject unauthorized
    {
      method: 'POST',
      dispatcher: client,
      headers: {
        'x-my-header': 'foo',
        'content-type': 'text-plain'
      },
      body: expectedBody
    }
  )

  const responseBody = await response.text()

  t.after(closeClientAndServerAsPromise(client, server))

  strictEqual(Buffer.concat(requestBody).toString('utf-8'), expectedBody)
  strictEqual(responseBody, expectedRequestBody)
})

// Skipping for now, there is something odd in the way the body is handled
test(
  '[Fetch] Should handle h2 request with body (stream)',
  async (t) => {
    const server = createSecureServer(pem)
    const expectedBody = readFileSync(__filename, 'utf-8')
    const stream = createReadStream(__filename)
    const requestChunks = []

    const { strictEqual } = tspl(t, { plan: 8 })

    server.on('stream', async (stream, headers) => {
      strictEqual(headers[':method'], 'PUT')
      strictEqual(headers[':path'], '/')
      strictEqual(headers[':scheme'], 'https')

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

    server.listen(0)
    await once(server, 'listening')

    const client = new Client(`https://localhost:${server.address().port}`, {
      connect: {
        rejectUnauthorized: false
      },
      allowH2: true
    })

    t.after(closeClientAndServerAsPromise(client, server))

    const response = await fetch(
      `https://localhost:${server.address().port}/`,
      // Needs to be passed to disable the reject unauthorized
      {
        method: 'PUT',
        dispatcher: client,
        headers: {
          'x-my-header': 'foo',
          'content-type': 'text-plain'
        },
        body: Readable.toWeb(stream),
        duplex: 'half'
      }
    )

    const responseBody = await response.text()

    strictEqual(response.status, 200)
    strictEqual(response.headers.get('content-type'), 'text/plain; charset=utf-8')
    strictEqual(response.headers.get('x-custom-h2'), 'foo')
    strictEqual(responseBody, 'hello h2!')
    strictEqual(Buffer.concat(requestChunks).toString('utf-8'), expectedBody)
  }
)
test('Should handle h2 request with body (Blob)', { skip: !Blob }, async (t) => {
  const server = createSecureServer(pem)
  const expectedBody = 'asd'
  const requestChunks = []
  const body = new Blob(['asd'], {
    type: 'text/plain'
  })

  const { strictEqual } = tspl(t, { plan: 8 })

  server.on('stream', async (stream, headers) => {
    strictEqual(headers[':method'], 'POST')
    strictEqual(headers[':path'], '/')
    strictEqual(headers[':scheme'], 'https')

    stream.on('data', chunk => requestChunks.push(chunk))

    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': headers['x-my-header'],
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

  t.after(closeClientAndServerAsPromise(client, server))

  const response = await fetch(
    `https://localhost:${server.address().port}/`,
    // Needs to be passed to disable the reject unauthorized
    {
      body,
      method: 'POST',
      dispatcher: client,
      headers: {
        'x-my-header': 'foo',
        'content-type': 'text-plain'
      }
    }
  )

  const responseBody = await response.arrayBuffer()

  strictEqual(response.status, 200)
  strictEqual(response.headers.get('content-type'), 'text/plain; charset=utf-8')
  strictEqual(response.headers.get('x-custom-h2'), 'foo')
  strictEqual(new TextDecoder().decode(responseBody).toString(), 'hello h2!')
  strictEqual(Buffer.concat(requestChunks).toString('utf-8'), expectedBody)
})

test(
  'Should handle h2 request with body (Blob:ArrayBuffer)',
  { skip: !Blob },
  async (t) => {
    const server = createSecureServer(pem)
    const expectedBody = 'hello'
    const requestChunks = []
    const expectedResponseBody = { hello: 'h2' }
    const buf = Buffer.from(expectedBody)
    const body = new ArrayBuffer(buf.byteLength)

    buf.copy(new Uint8Array(body))

    const { strictEqual, deepStrictEqual } = tspl(t, { plan: 8 })

    server.on('stream', async (stream, headers) => {
      strictEqual(headers[':method'], 'PUT')
      strictEqual(headers[':path'], '/')
      strictEqual(headers[':scheme'], 'https')

      stream.on('data', chunk => requestChunks.push(chunk))

      stream.respond({
        'content-type': 'application/json',
        'x-custom-h2': headers['x-my-header'],
        ':status': 200
      })

      stream.end(JSON.stringify(expectedResponseBody))
    })

    server.listen(0)
    await once(server, 'listening')

    const client = new Client(`https://localhost:${server.address().port}`, {
      connect: {
        rejectUnauthorized: false
      },
      allowH2: true
    })

    t.after(closeClientAndServerAsPromise(client, server))

    const response = await fetch(
      `https://localhost:${server.address().port}/`,
      // Needs to be passed to disable the reject unauthorized
      {
        body,
        method: 'PUT',
        dispatcher: client,
        headers: {
          'x-my-header': 'foo',
          'content-type': 'text-plain'
        }
      }
    )

    const responseBody = await response.json()

    strictEqual(response.status, 200)
    strictEqual(response.headers.get('content-type'), 'application/json')
    strictEqual(response.headers.get('x-custom-h2'), 'foo')
    deepStrictEqual(responseBody, expectedResponseBody)
    strictEqual(Buffer.concat(requestChunks).toString('utf-8'), expectedBody)
  }
)

test('Issue#2415', async (t) => {
  const { doesNotThrow } = tspl(t, { plan: 1 })
  const server = createSecureServer(pem)

  server.on('stream', async (stream, headers) => {
    stream.respond({
      ':status': 200
    })
    stream.end('test')
  })

  server.listen()
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  const response = await fetch(
    `https://localhost:${server.address().port}/`,
    // Needs to be passed to disable the reject unauthorized
    {
      method: 'GET',
      dispatcher: client
    }
  )

  await response.text()

  t.after(closeClientAndServerAsPromise(client, server))

  doesNotThrow(() => new Headers(response.headers))
})

test('Issue #2386', async (t) => {
  const server = createSecureServer(pem)
  const body = Buffer.from('hello')
  const requestChunks = []
  const expectedResponseBody = { hello: 'h2' }
  const controller = new AbortController()
  const signal = controller.signal

  const { strictEqual, ok } = tspl(t, { plan: 4 })

  server.on('stream', async (stream, headers) => {
    strictEqual(headers[':method'], 'PUT')
    strictEqual(headers[':path'], '/')
    strictEqual(headers[':scheme'], 'https')

    stream.on('data', chunk => requestChunks.push(chunk))

    stream.respond({
      'content-type': 'application/json',
      'x-custom-h2': headers['x-my-header'],
      ':status': 200
    })

    stream.end(JSON.stringify(expectedResponseBody))
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  t.after(closeClientAndServerAsPromise(client, server))

  await fetch(
    `https://localhost:${server.address().port}/`,
    // Needs to be passed to disable the reject unauthorized
    {
      body,
      signal,
      method: 'PUT',
      dispatcher: client,
      headers: {
        'x-my-header': 'foo',
        'content-type': 'text-plain'
      }
    }
  )

  controller.abort()
  ok(true)
})

test('Issue #3046', async (t) => {
  const server = createSecureServer(pem)

  const { strictEqual, deepStrictEqual } = tspl(t, { plan: 6 })

  server.on('stream', async (stream, headers) => {
    strictEqual(headers[':method'], 'GET')
    strictEqual(headers[':path'], '/')
    strictEqual(headers[':scheme'], 'https')

    stream.respond({
      'set-cookie': ['hello=world', 'foo=bar'],
      'content-type': 'text/html; charset=utf-8',
      ':status': 200
    })

    stream.end('<h1>Hello World</h1>')
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  t.after(closeClientAndServerAsPromise(client, server))

  const response = await fetch(
    `https://localhost:${server.address().port}/`,
    // Needs to be passed to disable the reject unauthorized
    {
      method: 'GET',
      dispatcher: client
    }
  )

  strictEqual(response.status, 200)
  strictEqual(response.headers.get('content-type'), 'text/html; charset=utf-8')
  deepStrictEqual(response.headers.getSetCookie(), ['hello=world', 'foo=bar'])
})
