'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createSecureServer } = require('node:http2')
const { once } = require('node:events')

const pem = require('@metcoder95/https-pem')

const { Client } = require('..')

// https://github.com/nodejs/undici/blob/main/docs/docs/api/Dispatcher.md
// `onInfo` is documented as "Invoked for each informational (1xx) response".
// HTTP/1 already forwards 1xx responses (e.g. 103 Early Hints) to `onInfo`;
// HTTP/2 must do the same via the http2 stream `headers` event.
test('h2 forwards 1xx informational responses to onInfo', async t => {
  t = tspl(t, { plan: 4 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))

  server.on('stream', (stream) => {
    stream.additionalHeaders({
      ':status': 103,
      link: '</style.css>; rel=preload; as=style'
    })
    stream.respond({
      ':status': 200,
      'content-type': 'text/plain'
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

  const infos = []
  const response = await client.request({
    path: '/',
    method: 'GET',
    onInfo: (info) => infos.push(info)
  })

  t.strictEqual(response.statusCode, 200)
  t.strictEqual(infos.length, 1)
  t.strictEqual(infos[0].statusCode, 103)
  t.strictEqual(infos[0].headers.link, '</style.css>; rel=preload; as=style')

  await response.body.text()
  await t.completed
})
