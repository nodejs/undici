'use strict'

const { test } = require('node:test')
const { constants, createSecureServer } = require('node:http2')
const { once } = require('node:events')
const pem = require('@metcoder95/https-pem')

const { Client, RetryAgent, fetch } = require('../..')
const { closeServerAsPromise } = require('../utils/node-http')

async function createReplayServer (refuseFirstStream) {
  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  const requestBodies = []
  let sessions = 0
  let streams = 0

  server.on('session', (session) => {
    sessions++
    session.on('error', () => {})
  })

  server.on('stream', (stream) => {
    stream.on('error', () => {})

    if (++streams === 1) {
      refuseFirstStream(stream)
      stream.resume()
      return
    }

    let body = ''
    stream.setEncoding('utf8')
    stream.on('data', chunk => { body += chunk })
    stream.on('end', () => {
      requestBodies.push(body)
      stream.respond({ ':status': 200 })
      stream.end('ok')
    })
  })

  server.listen(0)
  await once(server, 'listening')

  return {
    server,
    url: `https://localhost:${server.address().port}/`,
    requestBodies,
    get sessions () { return sessions },
    get streams () { return streams }
  }
}

function refuseWithGoaway (stream) {
  stream.session.goaway(constants.NGHTTP2_NO_ERROR, 0)
}

function refuseWithReset (stream) {
  stream.close(constants.NGHTTP2_REFUSED_STREAM)
}

for (const [name, body, expectedBody] of [
  ['string', 'foo=bar&hello=world', 'foo=bar&hello=world'],
  ['BufferSource', Buffer.from('foo=bar&hello=world'), 'foo=bar&hello=world'],
  ['URLSearchParams', new URLSearchParams({ foo: 'bar', hello: 'world' }), 'foo=bar&hello=world'],
  ['Blob', new Blob(['foo=bar&hello=world']), 'foo=bar&hello=world']
]) {
  test(`[Fetch] replays a ${name} body after an HTTP/2 GOAWAY`, async (t) => {
    const replayServer = await createReplayServer(refuseWithGoaway)
    const { server, url, requestBodies } = replayServer
    const client = new Client(url, {
      allowH2: true,
      connect: { rejectUnauthorized: false }
    })
    const dispatcher = new RetryAgent(client)

    t.after(async () => {
      await dispatcher.destroy()
      await closeServerAsPromise(server)()
    })

    const response = await fetch(url, {
      method: 'POST',
      body,
      dispatcher,
      signal: AbortSignal.timeout(5000)
    })

    t.assert.strictEqual(response.status, 200)
    t.assert.strictEqual(await response.text(), 'ok')
    t.assert.strictEqual(replayServer.sessions, 2)
    t.assert.strictEqual(replayServer.streams, 2)
    t.assert.deepStrictEqual(requestBodies, [expectedBody])
  })
}

test('[Fetch] replays a body after an HTTP/2 GOAWAY without RetryAgent', async (t) => {
  const replayServer = await createReplayServer(refuseWithGoaway)
  const { server, url, requestBodies } = replayServer
  const client = new Client(url, {
    allowH2: true,
    connect: { rejectUnauthorized: false }
  })

  t.after(async () => {
    await client.destroy()
    await closeServerAsPromise(server)()
  })

  const response = await fetch(url, {
    method: 'POST',
    body: 'foo=bar&hello=world',
    dispatcher: client,
    signal: AbortSignal.timeout(5000)
  })

  t.assert.strictEqual(response.status, 200)
  t.assert.strictEqual(await response.text(), 'ok')
  t.assert.strictEqual(replayServer.sessions, 2)
  t.assert.strictEqual(replayServer.streams, 2)
  t.assert.deepStrictEqual(requestBodies, ['foo=bar&hello=world'])
})

test('[Fetch] replays a body after an HTTP/2 REFUSED_STREAM', async (t) => {
  const replayServer = await createReplayServer(refuseWithReset)
  const { server, url, requestBodies } = replayServer
  const client = new Client(url, {
    allowH2: true,
    connect: { rejectUnauthorized: false }
  })
  const dispatcher = new RetryAgent(client)

  t.after(async () => {
    await dispatcher.destroy()
    await closeServerAsPromise(server)()
  })

  const response = await fetch(url, {
    method: 'POST',
    body: 'foo=bar&hello=world',
    dispatcher,
    signal: AbortSignal.timeout(5000)
  })

  t.assert.strictEqual(response.status, 200)
  t.assert.strictEqual(await response.text(), 'ok')
  t.assert.strictEqual(replayServer.sessions, 1)
  t.assert.strictEqual(replayServer.streams, 2)
  t.assert.deepStrictEqual(requestBodies, ['foo=bar&hello=world'])
})

test('[Fetch] does not replay a FormData body after an HTTP/2 GOAWAY', async (t) => {
  const replayServer = await createReplayServer(refuseWithGoaway)
  const { server, url } = replayServer
  const client = new Client(url, {
    allowH2: true,
    connect: { rejectUnauthorized: false }
  })

  t.after(async () => {
    await client.destroy()
    await closeServerAsPromise(server)()
  })

  const body = new FormData()
  body.set('foo', 'bar')

  await t.assert.rejects(
    fetch(url, {
      method: 'POST',
      body,
      dispatcher: client,
      signal: AbortSignal.timeout(5000)
    }),
    error => error.cause?.code === 'UND_ERR_INFO'
  )

  t.assert.strictEqual(replayServer.sessions, 1)
  t.assert.strictEqual(replayServer.streams, 1)
})

test('[Fetch] does not replay a ReadableStream body after an HTTP/2 GOAWAY', async (t) => {
  const replayServer = await createReplayServer(refuseWithGoaway)
  const { server, url } = replayServer
  const client = new Client(url, {
    allowH2: true,
    connect: { rejectUnauthorized: false }
  })

  t.after(async () => {
    await client.destroy()
    await closeServerAsPromise(server)()
  })

  await t.assert.rejects(
    fetch(url, {
      method: 'POST',
      body: new ReadableStream({
        start (controller) {
          controller.enqueue(Buffer.from('foo=bar&hello=world'))
          controller.close()
        }
      }),
      duplex: 'half',
      dispatcher: client,
      signal: AbortSignal.timeout(5000)
    }),
    error => error.cause?.code === 'UND_ERR_INFO'
  )

  t.assert.strictEqual(replayServer.sessions, 1)
  t.assert.strictEqual(replayServer.streams, 1)
})
