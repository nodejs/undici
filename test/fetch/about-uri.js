'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { fetch } = require('../..')

test('fetching about: uris', async (t) => {
  await t.test('about:blank', async () => {
    await assert.rejects(fetch('about:blank'))
  })

  await t.test('All other about: urls should return an error', async () => {
    try {
      await fetch('about:config')
      assert.fail('fetching about:config should fail')
    } catch (e) {
      assert.ok(e, 'this error was expected')
    }
  })
})
