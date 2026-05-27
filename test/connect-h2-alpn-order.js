'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after, mock } = require('node:test')
const { createSecureServer } = require('node:http2')
const { once } = require('node:events')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const tls = require('node:tls')

const { Client } = require('..')

const key = readFileSync(join(__dirname, 'fixtures', 'key.pem'), 'utf8')
const cert = readFileSync(join(__dirname, 'fixtures', 'cert.pem'), 'utf8')
const ca = readFileSync(join(__dirname, 'fixtures', 'ca.pem'), 'utf8')

function createServer () {
  const server = createSecureServer({ key, cert, allowHTTP1: true }, (req, res) => {
    res.writeHead(200)
    res.end()
  })
  after(() => server.close())
  return server
}

test('preferH2 offers ALPN as [h2, http/1.1] (h2 first)', async (t) => {
  t = tspl(t, { plan: 2 })

  const mockConnect = mock.method(tls, 'connect')
  const server = createServer()
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    allowH2: true,
    connect: { ca, servername: 'agent1', preferH2: true }
  })
  after(() => client.close())

  const { statusCode } = await client.request({ path: '/', method: 'GET' })
  t.equal(statusCode, 200)
  t.deepStrictEqual(mockConnect.mock.calls[0].arguments[0].ALPNProtocols, ['h2', 'http/1.1'])

  await t.completed
})

test('without preferH2 the default ALPN order [http/1.1, h2] is preserved', async (t) => {
  t = tspl(t, { plan: 2 })

  const mockConnect = mock.method(tls, 'connect')
  const server = createServer()
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    allowH2: true,
    connect: { ca, servername: 'agent1' }
  })
  after(() => client.close())

  const { statusCode } = await client.request({ path: '/', method: 'GET' })
  t.equal(statusCode, 200)
  t.deepStrictEqual(mockConnect.mock.calls[0].arguments[0].ALPNProtocols, ['http/1.1', 'h2'])

  await t.completed
})
