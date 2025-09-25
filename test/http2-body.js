'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createSecureServer } = require('node:http2')
const { createReadStream, readFileSync } = require('node:fs')
const { once } = require('node:events')

const pem = require('@metcoder95/https-pem')

const { Client, FormData, Response } = require('..')

test('Should handle h2 request without body', async t => {
  t = tspl(t, { plan: 9 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
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

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })
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

  await t.completed
})

test('Should handle h2 request with body (string or buffer) - dispatch', async t => {
  t = tspl(t, { plan: 9 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  const expectedBody = 'hello from client!'
  const response = []
  const requestBody = []

  server.on('stream', (stream, headers) => {
    stream.on('data', chunk => requestBody.push(chunk))

    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': headers['x-my-header'],
      ':status': 200
    })

    stream.end('hello h2!')
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })
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
        t.strictEqual(
          headers[1].toString('utf-8'),
          'text/plain; charset=utf-8'
        )
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

  await t.completed
})

test('Should handle h2 request with body (stream)', async t => {
  t = tspl(t, { plan: 8 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
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

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })
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

  await t.completed
})

test('Should handle h2 request with body (iterable)', async t => {
  t = tspl(t, { plan: 8 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
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

  server.on('stream', (stream, headers) => {
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

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })
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

  await t.completed
})

test('Should handle h2 request with body (Blob)', async t => {
  t = tspl(t, { plan: 8 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  const expectedBody = 'asd'
  const requestChunks = []
  const responseBody = []
  const body = new Blob(['asd'], {
    type: 'application/json'
  })

  server.on('stream', (stream, headers) => {
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

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })
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

  await t.completed
})

test('Should handle h2 request with body (Blob:ArrayBuffer)',
  async t => {
    t = tspl(t, { plan: 8 })

    const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
    const expectedBody = 'hello'
    const requestChunks = []
    const responseBody = []
    const buf = Buffer.from(expectedBody)
    const body = new ArrayBuffer(buf.byteLength)

    buf.copy(new Uint8Array(body))

    server.on('stream', (stream, headers) => {
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

    after(() => server.close())
    await once(server.listen(0), 'listening')

    const client = new Client(`https://localhost:${server.address().port}`, {
      connect: {
        rejectUnauthorized: false
      },
      allowH2: true
    })
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

    await t.completed
  }
)

test('#3803 - sending FormData bodies works', async (t) => {
  const assert = tspl(t, { plan: 4 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  server.on('stream', async (stream, headers) => {
    const contentLength = Number(headers['content-length'])

    assert.ok(!Number.isNaN(contentLength))
    assert.ok(headers['content-type']?.startsWith('multipart/form-data; boundary='))

    stream.respond({ ':status': 200 })

    const fd = await new Response(stream, {
      headers: {
        'content-type': headers['content-type']
      }
    }).formData()

    assert.deepEqual(fd.get('a'), 'b')
    assert.deepEqual(fd.get('c').name, 'e.fgh')

    stream.end()
  })

  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  t.after(async () => {
    server.close()
    await client.close()
  })

  const fd = new FormData()
  fd.set('a', 'b')
  fd.set('c', new Blob(['d']), 'e.fgh')

  await client.request({
    path: '/',
    method: 'POST',
    body: fd
  })

  await assert.completed
})
