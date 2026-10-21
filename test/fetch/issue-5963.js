'use strict'

const { test } = require('node:test')
const { fetch, MockAgent } = require('../..')

// https://github.com/nodejs/undici/issues/5963
test('MockAgent follows a redirect', async (t) => {
  const mockAgent = new MockAgent()
  mockAgent.disableNetConnect()
  t.after(() => mockAgent.close())

  const mockPool = mockAgent.get('http://localhost')
  mockPool.intercept({ path: '/redirect', method: 'GET' })
    .reply(307, '', { headers: { location: 'http://localhost/final' } })
  mockPool.intercept({ path: '/final', method: 'GET' }).reply(200, 'ok')

  const response = await fetch('http://localhost/redirect', { dispatcher: mockAgent })

  t.assert.strictEqual(response.status, 200)
  t.assert.strictEqual(await response.text(), 'ok')
  t.assert.ok(response.redirected)
})
