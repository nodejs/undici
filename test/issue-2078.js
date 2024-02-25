'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { MockAgent, getGlobalDispatcher, setGlobalDispatcher, fetch } = require('..')

test('MockPool.reply headers are an object, not an array - issue #2078', async (t) => {
  t = tspl(t, { plan: 1 })

  const global = getGlobalDispatcher()
  const mockAgent = new MockAgent()
  const mockPool = mockAgent.get('http://localhost')

  after(() => setGlobalDispatcher(global))
  setGlobalDispatcher(mockAgent)

  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).reply((options) => {
    t.strictEqual(Array.isArray(options.headers), false)

    return { statusCode: 200 }
  })

  await fetch('http://localhost/foo')

  await t.completed
})
