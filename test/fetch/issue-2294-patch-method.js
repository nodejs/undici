'use strict'

const { test, after } = require('node:test')
const { Request } = require('../..')

test('Using `patch` method emits a warning.', (t) => {
  t.plan(1)

  const { emitWarning } = process

  after(() => {
    process.emitWarning = emitWarning
  })

  process.emitWarning = (warning, options) => {
    t.assert.strictEqual(options.code, 'UNDICI-FETCH-patch')
  }

  // eslint-disable-next-line no-new
  new Request('https://a', { method: 'patch' })
})
