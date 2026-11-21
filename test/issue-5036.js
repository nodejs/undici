'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { MockAgent, setGlobalDispatcher } = require('../index.js')

test('MockAgent works with native Node.js fetch', async (t) => {
  // Only run if native fetch is available
  if (typeof globalThis.fetch !== 'function') {
    return
  }

  const agent = new MockAgent()
  agent.disableNetConnect()

  setGlobalDispatcher(agent)

  agent.get('https://example.com')
    .intercept({
      method: 'GET',
      path: '/v1/test'
    })
    .reply(200, { test: 123 })

  const req = await globalThis.fetch('https://example.com/v1/test')
  assert.strictEqual(req.status, 200)

  const data = await req.json()
  assert.deepStrictEqual(data, { test: 123 })
})
