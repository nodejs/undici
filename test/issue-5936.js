'use strict'

const assert = require('node:assert')
const { once } = require('node:events')
const { createSecureServer, constants: h2constants } = require('node:http2')
const { setTimeout: sleep } = require('node:timers/promises')
const { test } = require('node:test')
const pem = require('@metcoder95/https-pem')

const { Client } = require('..')

async function waitFor (predicate, timeout = 1000) {
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    if (predicate()) {
      return true
    }

    await sleep(10)
  }

  return predicate()
}

test('Issue #5936 - HTTP/2 idle reaper does not crash on lingering aborted stream handles', async (t) => {
  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  let streamsReceived = 0

  server.on('error', () => {})
  server.on('session', (session) => {
    session.on('error', () => {})
  })

  server.on('stream', (stream) => {
    streamsReceived++
    stream.on('error', () => {})
    stream.respond({ ':status': 200 })
    const interval = setInterval(() => {
      try {
        stream.write('chunk')
      } catch {
        clearInterval(interval)
      }
    }, 5)
    interval.unref()
    stream.on('close', () => clearInterval(interval))
  })

  t.after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    allowH2: true,
    keepAliveTimeout: 150,
    connect: {
      rejectUnauthorized: false
    }
  })
  t.after(() => client.close())

  const disconnected = once(client, 'disconnect')

  const controllers = []

  for (let i = 0; i < 5; i++) {
    const ac = new AbortController()
    controllers.push(ac)
    client.request({
      path: `/${i}`,
      method: 'GET',
      signal: ac.signal
    }).then(({ body }) => {
      body.on('error', () => {})
      body.resume()
    }).catch(() => {})
  }

  // Await until all streams have arrived at the server
  assert.strictEqual(await waitFor(() => streamsReceived === 5, 2000), true)

  // Abort all requests mid-stream while streams are actively receiving data
  for (const ac of controllers) {
    ac.abort()
  }

  // Wait for the HTTP/2 session idle reaper to trigger (keepAliveTimeout = 150ms)
  await disconnected
})


test('Issue #5936 - Stream error and severing retains persistent error sink on session teardown', async (t) => {
  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))

  server.on('error', () => {})
  server.on('session', (session) => {
    session.on('error', () => {})
  })

  server.on('stream', (stream) => {
    stream.on('error', () => {})
    // Reset the stream with an error code to trigger client stream 'error' event
    stream.close(h2constants.NGHTTP2_CANCEL)
  })

  t.after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    allowH2: true,
    keepAliveTimeout: 150,
    connect: {
      rejectUnauthorized: false
    }
  })
  t.after(() => client.close())

  const disconnected = once(client, 'disconnect')

  await assert.rejects(
    client.request({
      path: '/',
      method: 'GET'
    })
  )

  // Idle reaper triggers session teardown; severed stream must not crash
  await disconnected
})

test('Issue #5936 - onHttp2SocketClose cleanly destroys session when no requests are running', async (t) => {
  let serverSocket
  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))

  server.on('error', () => {})
  server.on('session', (session) => {
    session.on('error', () => {})
  })
  server.on('connection', (socket) => {
    serverSocket = socket
  })

  server.on('stream', (stream) => {
    stream.on('error', () => {})
    stream.respond({ ':status': 200 })
    stream.end('ok')
  })

  t.after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    allowH2: true,
    connect: {
      rejectUnauthorized: false
    }
  })
  t.after(() => client.close())

  const disconnected = once(client, 'disconnect')

  const res = await client.request({
    path: '/',
    method: 'GET'
  })
  await res.body.dump()

  // Close server socket while client has 0 running requests
  serverSocket.destroy()

  await disconnected
})

test('Issue #5936 - onHttp2SocketClose destroys session with error when requests are running', async (t) => {
  let serverSocket
  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))

  server.on('error', () => {})
  server.on('session', (session) => {
    session.on('error', () => {})
  })
  server.on('connection', (socket) => {
    serverSocket = socket
  })

  server.on('stream', (stream) => {
    stream.on('error', () => {})
    // Do not respond; abruptly destroy socket while request is running
    serverSocket.destroy()
  })

  t.after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    allowH2: true,
    connect: {
      rejectUnauthorized: false
    }
  })
  t.after(() => client.close())

  const disconnected = once(client, 'disconnect')

  await assert.rejects(
    client.request({
      path: '/',
      method: 'GET'
    })
  )

  await disconnected
})

test('Issue #5936 - releaseUpgradeStream retains persistent error sink on failed upgrade', async (t) => {
  const server = createSecureServer({
    ...(await pem.generate({ opts: { keySize: 2048 } })),
    settings: { enableConnectProtocol: true }
  })

  server.on('error', () => {})
  server.on('session', (session) => {
    session.on('error', () => {})
  })

  server.on('stream', (stream, headers) => {
    stream.on('error', () => {})
    if (headers[':method'] === 'CONNECT' && headers[':protocol'] === 'websocket') {
      stream.respond({ ':status': 404 })
      stream.end('not found')
    }
  })

  t.after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    allowH2: true,
    keepAliveTimeout: 150,
    connect: {
      rejectUnauthorized: false
    }
  })
  t.after(() => client.close())

  const disconnected = once(client, 'disconnect')

  await assert.rejects(
    client.upgrade({
      path: '/',
      protocol: 'websocket'
    })
  )

  // Idle reaper triggers session teardown; upgrade stream error sink must be attached
  await disconnected
})
