'use strict'

const { test } = require('tap')
const { Request } = require('../..')

test('Using `patch` method emits a warning.', (t) => {
  t.plan(1)

  const { emitWarning } = process

  t.teardown(() => {
    process.emitWarning = emitWarning
  })

  process.emitWarning = (warning, options) => {
    t.equal(options.code, 'UNDICI-FETCH-patch')
  }

  // eslint-disable-next-line no-new
  new Request('https://a', { method: 'patch' })
})
