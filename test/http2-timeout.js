'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createSecureServer } = require('node:http2')
const { createReadStream } = require('node:fs')
const { once } = require('node:events')

const pem = require('@metcoder95/https-pem')

const { Client } = require('..')

test('Should handle http2 stream timeout', async t => {
  t = tspl(t, { plan: 1 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  const stream = createReadStream(__filename)

  server.on('stream', (stream, headers) => {
    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': headers['x-my-header'],
      ':status': 200
    })

    setTimeout(() => {
      stream.end('hello h2!')
    }, 500)
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true,
    bodyTimeout: 50
  })
  after(() => client.close())

  const res = await client.request({
    path: '/',
    method: 'PUT',
    headers: {
      'x-my-header': 'foo'
    },
    body: stream
  })

  await t.rejects(res.body.text(), {
    message: 'HTTP/2: "stream timeout after 50"'
  })

  await t.completed
})

test('Should not double-decrement open streams counter on stream timeout', async t => {
  t = tspl(t, { plan: 1 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))

  server.on('stream', (stream, headers) => {
    stream.respond({ ':status': 200 })
    // Keep stream open past the body timeout
    setTimeout(() => {
      try { stream.end('hello h2!') } catch {}
    }, 1000)
  })

  after(() => server.close())
  await once(server.listen(0, '127.0.0.1'), 'listening')

  const client = new Client(`https://127.0.0.1:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true,
    bodyTimeout: 50
  })
  after(() => client.close())

  const res = await client.request({
    path: '/',
    method: 'GET'
  })

  try {
    await res.body.text()
  } catch {}

  // Allow time for the 'close' event to fire on the stream
  await new Promise(resolve => setTimeout(resolve, 200))

  // Reach into the internals to verify the open-streams counter didn't go negative
  const sessionSymbol = Object.getOwnPropertySymbols(client)
    .find(s => s.description === 'http2Session')
  const session = client[sessionSymbol]
  const openStreamsSymbol = Object.getOwnPropertySymbols(session)
    .find(s => s.description === 'open streams')

  t.strictEqual(session[openStreamsSymbol], 0)

  await t.completed
})
