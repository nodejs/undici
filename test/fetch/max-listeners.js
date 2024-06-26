'use strict'

const { setMaxListeners, getMaxListeners, defaultMaxListeners } = require('events')
const { test } = require('node:test')
const assert = require('node:assert')
const { Request } = require('../..')

test('test max listeners', (t) => {
  const controller = new AbortController()
  setMaxListeners(Infinity, controller.signal)
  for (let i = 0; i <= defaultMaxListeners; i++) {
    // eslint-disable-next-line no-new
    new Request('http://asd', { signal: controller.signal })
  }
  assert.strictEqual(getMaxListeners(controller.signal), Infinity)
})
