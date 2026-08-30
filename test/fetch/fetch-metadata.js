'use strict'

const { test } = require('node:test')
const http = require('node:http')
const { once } = require('node:events')
const { fetch, MockAgent } = require('../..')
const { closeServerAsPromise } = require('../utils/node-http')

// https://w3c.github.io/webappsec-fetch-metadata/#abstract-opdef-append-the-fetch-metadata-headers-for-a-request
// https://github.com/nodejs/undici/issues/1305
//
// "append the Fetch metadata headers for a request" step 1: no Sec-Fetch-*
// header is sent when the request's current URL is not potentially
// trustworthy. The check runs against the current URL, so it is re-evaluated
// on every redirect hop.
//
// MockAgent + disableNetConnect() observes headers for hosts the test must
// not connect to; the loopback cases use a real server so the assertion is
// on what actually reached the socket.

function createMockAgent (t) {
  const mockAgent = new MockAgent({ enableCallHistory: true })
  mockAgent.disableNetConnect()
  t.after(() => mockAgent.close())
  return mockAgent
}

async function startServer (t) {
  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end(JSON.stringify({ secFetchMode: req.headers['sec-fetch-mode'] ?? null }))
  })
  t.after(closeServerAsPromise(server))
  await once(server.listen(0), 'listening')
  return server.address().port
}

for (const origin of ['http://example.com', 'http://192.168.0.12']) {
  test(`sec-fetch-mode is not sent to ${origin} (not potentially trustworthy)`, async (t) => {
    const mockAgent = createMockAgent(t)
    mockAgent.get(origin).intercept({ path: '/' }).reply(200, 'ok')

    const response = await fetch(`${origin}/`, { dispatcher: mockAgent })
    t.assert.strictEqual(await response.text(), 'ok')

    const headers = mockAgent.getCallHistory().lastCall().headers
    t.assert.strictEqual(headers['sec-fetch-mode'], undefined)
  })
}

test('sec-fetch-mode is sent to an https origin', async (t) => {
  const mockAgent = createMockAgent(t)
  mockAgent.get('https://example.com').intercept({ path: '/' }).reply(200, 'ok')

  const response = await fetch('https://example.com/', { dispatcher: mockAgent })
  t.assert.strictEqual(await response.text(), 'ok')

  const headers = mockAgent.getCallHistory().lastCall().headers
  t.assert.strictEqual(headers['sec-fetch-mode'], 'cors')
})

for (const host of ['localhost', '127.0.0.1']) {
  test(`sec-fetch-mode is sent to http://${host} (potentially trustworthy)`, async (t) => {
    const port = await startServer(t)

    const response = await fetch(`http://${host}:${port}/`)
    const body = await response.json()
    t.assert.strictEqual(body.secFetchMode, 'cors')
  })
}

test('sec-fetch-mode is dropped after a redirect to a non-trustworthy URL', async (t) => {
  const mockAgent = createMockAgent(t)
  mockAgent.get('https://example.com').intercept({ path: '/a' }).reply(302, '', {
    headers: { location: 'http://example.com/b' }
  })
  mockAgent.get('http://example.com').intercept({ path: '/b' }).reply(200, 'ok')

  const response = await fetch('https://example.com/a', { dispatcher: mockAgent })
  t.assert.strictEqual(await response.text(), 'ok')

  const [first, second] = mockAgent.getCallHistory().calls()
  t.assert.strictEqual(first.headers['sec-fetch-mode'], 'cors')
  t.assert.strictEqual(second.headers['sec-fetch-mode'], undefined)
})

test('sec-fetch-mode is added after a redirect to a trustworthy URL', async (t) => {
  const mockAgent = createMockAgent(t)
  mockAgent.get('http://example.com').intercept({ path: '/a' }).reply(302, '', {
    headers: { location: 'https://example.com/b' }
  })
  mockAgent.get('https://example.com').intercept({ path: '/b' }).reply(200, 'ok')

  const response = await fetch('http://example.com/a', { dispatcher: mockAgent })
  t.assert.strictEqual(await response.text(), 'ok')

  const [first, second] = mockAgent.getCallHistory().calls()
  t.assert.strictEqual(first.headers['sec-fetch-mode'], undefined)
  t.assert.strictEqual(second.headers['sec-fetch-mode'], 'cors')
})
