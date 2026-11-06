'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after, mock } = require('node:test')
const { createServer } = require('node:https')
const { once } = require('node:events')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const tls = require('node:tls')

const { Client } = require('..')

const key = readFileSync(join(__dirname, 'fixtures', 'key.pem'), 'utf8')
const cert = readFileSync(join(__dirname, 'fixtures', 'cert.pem'), 'utf8')
const ca = readFileSync(join(__dirname, 'fixtures', 'ca.pem'), 'utf8')

async function setup () {
  const server = createServer({ key, cert }, (req, res) => res.end('ok'))
  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    // The fixture certificate is only valid for agent1
    connect: { ca, checkServerIdentity: () => undefined }
  })
  after(() => client.close())
  return client
}

test('servername follows the host header by default', async (t) => {
  t = tspl(t, { plan: 2 })

  const mockConnect = mock.method(tls, 'connect')
  const client = await setup()

  for (const host of ['agent1', 'localhost']) {
    const { body } = await client.request({ path: '/', method: 'GET', headers: { host } })
    await body.dump()
  }

  // The server name changed, so the client had to reconnect
  t.equal(mockConnect.mock.calls.length, 2)
  t.deepStrictEqual(
    mockConnect.mock.calls.map((call) => call.arguments[0].servername),
    ['agent1', 'localhost']
  )

  await t.completed
})

test('an explicit servername is shared across requests with different host headers', async (t) => {
  t = tspl(t, { plan: 2 })

  const mockConnect = mock.method(tls, 'connect')
  const client = await setup()

  for (const host of ['a.example.com', 'b.example.com', 'c.example.com']) {
    const { body } = await client.request({
      path: '/',
      method: 'GET',
      headers: { host },
      servername: 'agent1'
    })
    await body.dump()
  }

  t.equal(mockConnect.mock.calls.length, 1)
  t.equal(mockConnect.mock.calls[0].arguments[0].servername, 'agent1')

  await t.completed
})
