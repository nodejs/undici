'use strict'

const { test } = require('tap')
const { fetch } = require('../..')

test('fetching about: uris', async (t) => {
  t.test('about:blank', async (t) => {
    await t.rejects(fetch('about:blank'))
  })

  t.test('All other about: urls should return an error', async (t) => {
    try {
      await fetch('about:config')
      t.fail('fetching about:config should fail')
    } catch (e) {
      t.ok(e, 'this error was expected')
    } finally {
      t.end()
    }
  })
})
