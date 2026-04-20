'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createSecureServer } = require('node:http2')
const { createReadStream } = require('node:fs')
const { once } = require('node:events')

const pem = require('@metcoder95/https-pem')

const { Client } = require('..')
const { kHTTP2Session } = require('../lib/core/symbols')

test('Should handle http2 stream timeout', async t => {
  t = tspl(t, { plan: 2 })

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

  const session = client[kHTTP2Session]
  const kOpenStreams = Object.getOwnPropertySymbols(session)
    .find((symbol) => symbol.description === 'open streams')

  t.strictEqual(session[kOpenStreams], 0)

  await t.completed
})
