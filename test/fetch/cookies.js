'use strict'

const { once } = require('node:events')
const { createServer } = require('node:http')
const { test } = require('node:test')
const assert = require('node:assert')
const { tspl } = require('@matteo.collina/tspl')
const { Client, fetch, Headers } = require('../..')
const { closeServerAsPromise } = require('../utils/node-http')
const pem = require('https-pem')
const { createSecureServer } = require('node:http2')
const { closeClientAndServerAsPromise } = require('../utils/node-http')

test('Can receive set-cookie headers from a server using fetch - issue #1262', async (t) => {
  const server = createServer((req, res) => {
    res.setHeader('set-cookie', 'name=value; Domain=example.com')
    res.end()
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  const response = await fetch(`http://localhost:${server.address().port}`)

  assert.strictEqual(response.headers.get('set-cookie'), 'name=value; Domain=example.com')

  const response2 = await fetch(`http://localhost:${server.address().port}`, {
    credentials: 'include'
  })

  assert.strictEqual(response2.headers.get('set-cookie'), 'name=value; Domain=example.com')
})

test('Can send cookies to a server with fetch - issue #1463', async (t) => {
  const server = createServer((req, res) => {
    assert.strictEqual(req.headers.cookie, 'value')
    res.end()
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  const headersInit = [
    new Headers([['cookie', 'value']]),
    { cookie: 'value' },
    [['cookie', 'value']]
  ]

  for (const headers of headersInit) {
    await fetch(`http://localhost:${server.address().port}`, { headers })
  }
})

test('Cookie header is delimited with a semicolon rather than a comma - issue #1905', async (t) => {
  const { strictEqual } = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    strictEqual(req.headers.cookie, 'FOO=lorem-ipsum-dolor-sit-amet; BAR=the-quick-brown-fox')
    res.end()
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  await fetch(`http://localhost:${server.address().port}`, {
    headers: [
      ['cookie', 'FOO=lorem-ipsum-dolor-sit-amet'],
      ['cookie', 'BAR=the-quick-brown-fox']
    ]
  })
})

test('Can receive set-cookie headers from a http2 server using fetch - issue #2885', async (t) => {
  const server = createSecureServer(pem)
  server.on('stream', async (stream, headers) => {
    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-method': headers[':method'],
      'set-cookie': 'Space=Cat; Secure; HttpOnly',
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
      dispatcher: client,
      headers: {
        'content-type': 'text-plain'
      }
    }
  )

  t.after(closeClientAndServerAsPromise(client, server))

  assert.deepStrictEqual(response.headers.getSetCookie(), ['Space=Cat; Secure; HttpOnly'])
})
