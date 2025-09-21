'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createSecureServer } = require('node:http2')
const { once } = require('node:events')

const pem = require('@metcoder95/https-pem')

const { Client } = require('..')

test('Should provide pseudo-headers in proper order', async t => {
  t = tspl(t, { plan: 2 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  server.on('stream', (stream, _headers, _flags, rawHeaders) => {
    t.deepStrictEqual(rawHeaders, [
      ':authority',
      `localhost:${server.address().port}`,
      ':method',
      'GET',
      ':path',
      '/',
      ':scheme',
      'https'
    ])

    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      ':status': 200
    })
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

  const response = await client.request({
    path: '/',
    method: 'GET'
  })

  t.strictEqual(response.statusCode, 200)

  await response.body.dump()

  await t.completed
})

test('The h2 pseudo-headers is not included in the headers', async t => {
  t = tspl(t, { plan: 2 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))

  server.on('stream', (stream, headers) => {
    stream.respond({
      ':status': 200
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

  const response = await client.request({
    path: '/',
    method: 'GET'
  })

  await response.body.text()

  t.strictEqual(response.statusCode, 200)
  t.strictEqual(response.headers[':status'], undefined)

  await t.completed
})
