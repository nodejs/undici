'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test } = require('node:test')

test('frozen globalThis - setGlobalDispatcher succeeds', (t) => {
  t = tspl(t, { plan: 2 })

  // Freeze globalThis
  Object.freeze(globalThis)

  // Dynamically require inside test to get fresh module state
  // in a frozen globalThis context
  const { setGlobalDispatcher, getGlobalDispatcher } = require('../lib/global')
  const Agent = require('../lib/dispatcher/agent')

  // Create a new dispatcher and set it - should not throw
  const newAgent = new Agent()
  let setError = null
  try {
    setGlobalDispatcher(newAgent)
  } catch (err) {
    setError = err
  }

  t.ifError(setError, 'setGlobalDispatcher should not throw with frozen globalThis')

  // Verify we can retrieve a dispatcher
  const retrieved = getGlobalDispatcher()
  t.ok(retrieved, 'getGlobalDispatcher should return a dispatcher')
})

test('frozen globalThis - graceful degradation', (t) => {
  t = tspl(t, { plan: 1 })

  // globalThis is already frozen from previous test
  const { getGlobalDispatcher } = require('../lib/global')

  // Should still be able to get a dispatcher without errors
  const dispatcher = getGlobalDispatcher()
  t.ok(dispatcher !== null && dispatcher !== undefined, 'getGlobalDispatcher should return a valid dispatcher even with frozen globalThis')
})

test('frozen globalThis - fallback dispatcher persists', (t) => {
  t = tspl(t, { plan: 2 })

  // globalThis is already frozen from previous tests
  const { getGlobalDispatcher, setGlobalDispatcher } = require('../lib/global')
  const Agent = require('../lib/dispatcher/agent')

  // Get current dispatcher
  const dispatcher1 = getGlobalDispatcher()
  t.ok(dispatcher1, 'First call to getGlobalDispatcher returns dispatcher')

  // Set a new one
  const newAgent = new Agent()
  setGlobalDispatcher(newAgent)

  // Get again - should return the one we just set (from fallback)
  const dispatcher2 = getGlobalDispatcher()
  t.equal(dispatcher2, newAgent, 'getGlobalDispatcher returns dispatcher set in frozen globalThis')
})
