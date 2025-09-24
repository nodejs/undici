'use strict'

const { Headers } = require('../../lib/web/fetch/headers')
const { test } = require('node:test')
const util = require('node:util')

test('Headers class custom inspection', (t) => {
  const headers = new Headers()
  headers.set('Content-Type', 'application/json')
  headers.set('Authorization', 'Bearer token')

  const inspectedOutput = util.inspect(headers, { depth: 1 })

  const expectedOutput = "Headers { 'Content-Type': 'application/json', Authorization: 'Bearer token' }"
  t.assert.strictEqual(inspectedOutput, expectedOutput)
})
