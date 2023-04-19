'use strict'

const { test, skip } = require('tap')
const { nodeMajor, nodeMinor } = require('../lib/core/util')
const { MockAgent, getGlobalDispatcher, setGlobalDispatcher, fetch } = require('..')

if (nodeMajor < 16 || (nodeMajor === 16 && nodeMinor < 8)) {
  skip('fetch is not supported in node < v16.8.0')
  process.exit()
}

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
