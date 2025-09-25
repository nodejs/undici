'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createSecureServer } = require('node:http2')
const { once } = require('node:events')
const { Writable, pipeline, PassThrough, Readable } = require('node:stream')

const pem = require('@metcoder95/https-pem')

const { Client } = require('..')

test('Dispatcher#Stream', async t => {
  t = tspl(t, { plan: 4 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  const expectedBody = 'hello from client!'
  const bufs = []
  let requestBody = ''

  server.on('stream', (stream, headers) => {
    stream.setEncoding('utf-8')
    stream.on('data', chunk => {
      requestBody += chunk
    })

    stream.respond({ ':status': 200, 'x-custom': 'custom-header' })
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

  await t.completed
})

test('Dispatcher#Pipeline', async t => {
  t = tspl(t, { plan: 5 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  const expectedBody = 'hello from client!'
  const bufs = []
  let requestBody = ''

  server.on('stream', (stream, headers) => {
    stream.setEncoding('utf-8')
    stream.on('data', chunk => {
      requestBody += chunk
    })

    stream.respond({ ':status': 200, 'x-custom': 'custom-header' })
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

  await t.completed
})

test('Dispatcher#Connect', async t => {
  t = tspl(t, { plan: 5 })

  const proxy = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))

  const expectedBody = 'hello from client!'
  let responseBody = ''
  let requestBody = ''

  proxy.on('stream', async (stream, headers) => {
    if (headers[':method'] !== 'CONNECT') {
      t.fail('Unexpected CONNECT method')
      return
    }

    const forward = new Client(`https://localhost:${server.address().port}`, {
      connect: {
        rejectUnauthorized: false
      },
      allowH2: true
    })
    after(() => forward.close())

    const response = await forward.request({
      path: '/',
      method: 'POST',
      body: stream,
      headers: {
        'x-my-header': headers['x-my-header']
      }
    })

    stream.respond({ ':status': 200, 'x-my-header': response.headers['x-my-header'] })
    response.body.pipe(stream)
  })

  server.on('stream', (stream, headers) => {
    stream.setEncoding('utf-8')
    stream.on('data', chunk => {
      requestBody += chunk
    })
    stream.once('end', () => {
      t.strictEqual(requestBody, expectedBody)
    })

    stream.respond({ ':status': 200, 'x-my-header': headers['x-my-header'] })
    stream.end('helloworld')
  })

  after(() => proxy.close())
  await once(proxy.listen(0), 'listening')

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${proxy.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })
  after(() => client.close())

  const { statusCode, headers, socket } = await client.connect({ path: '/', headers: { 'x-my-header': 'foo' } })
  t.strictEqual(statusCode, 200)
  t.strictEqual(headers['x-my-header'], 'foo')
  t.strictEqual(socket.closed, false)

  socket.on('data', chunk => { responseBody += chunk })
  socket.once('end', () => {
    t.strictEqual(responseBody, 'helloworld')
  })
  socket.setEncoding('utf-8')
  socket.cork()
  socket.write(expectedBody)
  socket.uncork()
  socket.end()

  await t.completed
})

test('Dispatcher#Upgrade - Should throw on non-websocket upgrade', async t => {
  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))

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
      await client.upgrade({ path: '/', protocol: 'any' })
    } catch (error) {
      t.strictEqual(error.message, 'Custom upgrade "any" not supported over HTTP/2')
    }
  })

  await t.completed
})

test('Dispatcher#Upgrade', async t => {
  t = tspl(t, { plan: 3 })

  const server = createSecureServer({ ...(await pem.generate({ opts: { keySize: 2048 } })), settings: { enableConnectProtocol: true } })

  server.on('stream', (stream, headers) => {
    stream.respond({ ':status': 200 })
    stream.end()
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

  const { socket } = await client.upgrade({ path: '/', protocol: 'websocket' })

  t.ok(socket.readable)
  t.ok(socket.writable)
  t.strictEqual(socket.closed, false)

  after(() => socket.end())

  await t.completed
})

test('Dispatcher#destroy', async t => {
  t = tspl(t, { plan: 4 })

  const promises = []
  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))

  server.on('stream', (stream, headers) => {
    setTimeout(stream.end.bind(stream), 1500)
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })
  // we don't want to close the client gracefully in an after hook

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

  await t.completed
})

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
