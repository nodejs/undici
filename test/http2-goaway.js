'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createSecureServer } = require('node:http2')
const { once } = require('node:events')

const pem = require('@metcoder95/https-pem')

const { Client } = require('..')

test('#3046 - GOAWAY Frame', async t => {
  t = tspl(t, { plan: 8 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))

  server.on('stream', (stream, headers) => {
    setTimeout(() => {
      if (stream.closed) return
      stream.end('Hello World')
    }, 100)

    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': 'hello',
      ':status': 200
    })
  })

  server.on('session', session => {
    setTimeout(() => {
      session.goaway()
    }, 50)
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

  client.on('connectionError', () => {
    t.fail('unexpected connectionError')
  })

  client.on('disconnect', (url, disconnectClient, err) => {
    t.ok(url instanceof URL)
    t.deepStrictEqual(disconnectClient, [client])
    t.strictEqual(err.message, 'HTTP/2: "GOAWAY" frame received with code 0')
    t.strictEqual(err.code, 'UND_ERR_INFO')
  })

  const response = await client.request({
    path: '/',
    method: 'GET',
    headers: {
      'x-my-header': 'foo'
    }
  })

  t.strictEqual(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.strictEqual(response.headers['x-custom-h2'], 'hello')
  t.strictEqual(response.statusCode, 200)
  t.strictEqual(await response.body.text(), 'Hello World')

  await t.completed
})

test('#3753 - Handle GOAWAY Gracefully', async (t) => {
  t = tspl(t, { plan: 30 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  let counter = 0
  let session = null

  server.on('session', s => {
    session = s
  })

  server.on('stream', (stream) => {
    counter++

    // Due to the nature of the test, we need to ignore the error
    // that is thrown when the session is destroyed and stream
    // is in-flight
    stream.on('error', () => {})
    if (counter === 9 && session != null) {
      session.goaway()
    }

    stream.respond({
      'content-type': 'text/plain',
      ':status': 200
    })
    setTimeout(() => {
      if (stream.closed) return
      stream.end('hello world')
    }, 150)
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    pipelining: 2,
    allowH2: true
  })
  after(() => client.close())

  for (let i = 0; i < 15; i++) {
    client.request({
      path: '/',
      method: 'GET',
      headers: {
        'x-my-header': 'foo'
      }
    }, (err, response) => {
      if (err) {
        t.strictEqual(err.message, 'HTTP/2: "GOAWAY" frame received with code 0')
        t.strictEqual(err.code, 'UND_ERR_INFO')
      } else {
        t.strictEqual(response.statusCode, 200)
        ;(async function () {
          let body
          try {
            body = await response.body.text()
          } catch (err) {
            t.fail(err)
            return
          }
          t.strictEqual(body, 'hello world')
        })()
      }
    })
  }

  await t.completed
})

test('#5089 - Handle GOAWAY Gracefully', async (t) => {
  t = tspl(t, { plan: 7 })

  const server = createSecureServer({
    ...await pem.generate({
      opts: { keySize: 2048 }
    }),
    settings: {
      maxConcurrentStreams: 2
    }
  })
  let firstSession = null
  const sessionCounts = new Map()

  server.on('session', (session) => {
    sessionCounts.set(session, 0)

    if (firstSession == null) {
      firstSession = session
    }
  })

  server.on('stream', (stream) => {
    stream.on('error', () => {})

    const count = sessionCounts.get(stream.session) + 1
    sessionCounts.set(stream.session, count)

    if (stream.session === firstSession && count === 2) {
      setTimeout(() => {
        firstSession.goaway()
      }, 20)
    }

    stream.respond({
      'content-type': 'text/plain',
      ':status': 200
    })
    setTimeout(() => {
      stream.end('hello world')
    }, 150)
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    maxConcurrentStreams: 2,
    pipelining: 10,
    allowH2: true
  })
  after(() => client.close())

  client.on('connectionError', () => {
    t.fail('unexpected connectionError')
  })

  client.once('disconnect', (url, disconnectClient, err) => {
    t.ok(url instanceof URL)
    t.deepStrictEqual(disconnectClient, [client])
    t.strictEqual(err.message, 'HTTP/2: "GOAWAY" frame received with code 0')
    t.strictEqual(err.code, 'UND_ERR_INFO')
  })

  const results = await Promise.all(Array.from({ length: 6 }, () => client.request({
    path: '/',
    method: 'GET',
    headers: {
      'x-my-header': 'foo'
    }
  }).then(async (response) => {
    return {
      statusCode: response.statusCode,
      body: await response.body.text()
    }
  })))

  t.deepStrictEqual([...sessionCounts.values()], [2, 4])
  t.deepStrictEqual(results.map((result) => result.statusCode), Array(6).fill(200))
  t.deepStrictEqual(results.map((result) => result.body), Array(6).fill('hello world'))

  await t.completed
})
