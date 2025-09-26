'use strict'

const { once } = require('node:events')
const { createServer } = require('node:http')
const { test, describe, before, after } = require('node:test')
const { stringify: qsStringify } = require('node:querystring')
const { Client, fetch, Headers } = require('../..')
const pem = require('@metcoder95/https-pem')
const { createSecureServer } = require('node:http2')

describe('cookies', () => {
  let server

  before(() => {
    server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      const searchParams = new URL(req.url, 'http://localhost').searchParams
      if (searchParams.has('set-cookie')) {
        res.setHeader('set-cookie', searchParams.get('set-cookie'))
      }
      res.end(req.headers.cookie)
    })

    return once(server.listen(0), 'listening')
  })

  after(() => {
    setImmediate(() => server.close())
  })

  test('Can receive set-cookie headers from a server using fetch - issue #1262', async (t) => {
    const query = qsStringify({
      'set-cookie': 'name=value; Domain=example.com'
    })
    const response = await fetch(`http://localhost:${server.address().port}?${query}`)

    t.assert.strictEqual(response.headers.get('set-cookie'), 'name=value; Domain=example.com')
    t.assert.strictEqual(await response.text(), '')

    const response2 = await fetch(`http://localhost:${server.address().port}?${query}`, {
      credentials: 'include'
    })

    t.assert.strictEqual(response2.headers.get('set-cookie'), 'name=value; Domain=example.com')
    t.assert.strictEqual(await response2.text(), '')
  })

  test('Can send cookies to a server with fetch - issue #1463', async (t) => {
    const headersInit = [
      new Headers([['cookie', 'value']]),
      { cookie: 'value' },
      [['cookie', 'value']]
    ]

    for (const headers of headersInit) {
      const response = await fetch(`http://localhost:${server.address().port}`, { headers })
      const text = await response.text()
      t.assert.strictEqual(text, 'value')
    }
  })

  test('Cookie header is delimited with a semicolon rather than a comma - issue #1905', async (t) => {
    const response = await fetch(`http://localhost:${server.address().port}`, {
      headers: [
        ['cookie', 'FOO=lorem-ipsum-dolor-sit-amet'],
        ['cookie', 'BAR=the-quick-brown-fox']
      ]
    })

    t.assert.strictEqual(await response.text(), 'FOO=lorem-ipsum-dolor-sit-amet; BAR=the-quick-brown-fox')
  })

  test('Can receive set-cookie headers from a http2 server using fetch - issue #2885', async (t) => {
    const server = createSecureServer(pem)
    server.on('stream', (stream, headers) => {
      stream.respond({
        'content-type': 'text/plain; charset=utf-8',
        'x-method': headers[':method'],
        'set-cookie': 'Space=Cat; Secure; HttpOnly',
        ':status': 200
      })

      stream.end('test')
    })

    await once(server.listen(0), 'listening')

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

    t.assert.deepStrictEqual(response.headers.getSetCookie(), ['Space=Cat; Secure; HttpOnly'])
    t.assert.strictEqual(await response.text(), 'test')

    await client.close()
    await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()))
  })
})
