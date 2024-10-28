'use strict'

const { setMaxListeners, getMaxListeners, defaultMaxListeners } = require('events')
const { test } = require('node:test')
const assert = require('node:assert')
const { Request } = require('../..')
const util = require('../../lib/core/util')

// https://github.com/nodejs/node/commit/d4736060404726a24d4e52647b8c9b88914b8ddf
const isFixedOrderAbortSignalAny = typeof AbortSignal.any === 'function' && util.nodeMajor >= 23

// TODO: Drop support below node v23, then delete this.
test('test max listeners', { skip: isFixedOrderAbortSignalAny }, (t) => {
  const controller = new AbortController()
  setMaxListeners(Infinity, controller.signal)
  for (let i = 0; i <= defaultMaxListeners; i++) {
    // eslint-disable-next-line no-new
    new Request('http://asd', { signal: controller.signal })
  }
  assert.strictEqual(getMaxListeners(controller.signal), Infinity)
})
