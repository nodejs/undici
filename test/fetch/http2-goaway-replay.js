'use strict'

const { test } = require('node:test')
const { constants, createSecureServer } = require('node:http2')
const { once } = require('node:events')
const pem = require('@metcoder95/https-pem')

const { Client, RetryAgent, fetch } = require('../..')
const { closeServerAsPromise } = require('../utils/node-http')

async function createGoawayServer () {
  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  const sessionIds = new WeakMap()
  const requestBodies = []
  let sessions = 0

  server.on('session', (session) => {
    const sessionId = ++sessions
    sessionIds.set(session, sessionId)
    session.on('error', () => {})

    if (sessionId === 1) {
      session.goaway(constants.NGHTTP2_NO_ERROR, 0)
    }
  })

  server.on('stream', (stream) => {
    stream.on('error', () => {})
    let body = ''
    stream.setEncoding('utf8')
    stream.on('data', chunk => { body += chunk })
    stream.on('end', () => {
      requestBodies.push(body)

      if (sessionIds.get(stream.session) > 1) {
        stream.respond({ ':status': 200 })
        stream.end('ok')
      }
    })
  })

  server.listen(0)
  await once(server, 'listening')

  return {
    server,
    url: `https://localhost:${server.address().port}/`,
    requestBodies,
    get sessions () { return sessions }
  }
}

for (const [name, body, expectedBody] of [
  ['string', 'foo=bar&hello=world', 'foo=bar&hello=world'],
  ['BufferSource', Buffer.from('foo=bar&hello=world'), 'foo=bar&hello=world'],
  ['URLSearchParams', new URLSearchParams({ foo: 'bar', hello: 'world' }), 'foo=bar&hello=world'],
  ['Blob', new Blob(['foo=bar&hello=world']), 'foo=bar&hello=world']
]) {
  test(`[Fetch] replays a ${name} body after an HTTP/2 GOAWAY`, async (t) => {
    const goawayServer = await createGoawayServer()
    const { server, url, requestBodies } = goawayServer
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
    t.assert.strictEqual(goawayServer.sessions, 2)
    t.assert.strictEqual(requestBodies[requestBodies.length - 1], expectedBody)
  })
}

test('[Fetch] does not replay a ReadableStream body after an HTTP/2 GOAWAY', async (t) => {
  const goawayServer = await createGoawayServer()
  const { server, url } = goawayServer
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

  t.assert.strictEqual(goawayServer.sessions, 1)
})
