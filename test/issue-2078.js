'use strict'

const { test } = require('tap')
const { MockAgent, getGlobalDispatcher, setGlobalDispatcher, fetch } = require('..')

test('MockPool.reply headers are an object, not an array - issue #2078', async (t) => {
  const global = getGlobalDispatcher()
  const mockAgent = new MockAgent()
  const mockPool = mockAgent.get('http://localhost')

  t.teardown(() => setGlobalDispatcher(global))
  setGlobalDispatcher(mockAgent)

  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).reply((options) => {
    t.ok(!Array.isArray(options.headers))

    return { statusCode: 200 }
  })

  await t.resolves(fetch('http://localhost/foo'))
})
