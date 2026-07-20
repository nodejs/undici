'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test } = require('node:test')

test('frozen globalThis - setGlobalDispatcher succeeds', async (t) => {
  t = tspl(t, { plan: 2 })

  // Freeze globalThis
  Object.freeze(globalThis)

  try {
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
  } finally {
    // globalThis remains frozen for remainder of process
  }

  await t.completed
})

test('frozen globalThis - graceful degradation', async (t) => {
  t = tspl(t, { plan: 1 })

  // globalThis is already frozen from previous test
  try {
    const { getGlobalDispatcher } = require('../lib/global')

    // Should still be able to get a dispatcher without errors
    const dispatcher = getGlobalDispatcher()
    t.ok(dispatcher !== null && dispatcher !== undefined, 'getGlobalDispatcher should return a valid dispatcher even with frozen globalThis')
  } catch (err) {
    t.fail(`should not throw: ${err.message}`)
  }

  await t.completed
})
