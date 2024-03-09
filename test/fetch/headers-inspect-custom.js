'use strict'

const { Headers } = require('../../lib/web/fetch/headers')
const { test } = require('node:test')
const assert = require('node:assert')
const util = require('util')

test('Headers class custom inspection', () => {
  const headers = new Headers()
  headers.set('content-Type', 'application/json')
  headers.set('authorization', 'Bearer token')

  const inspectedOutput = util.inspect(headers, { depth: 1 })

  const expectedOutput =
    'Headers:\nContent-Type: application/json\nAuthorization: Bearer token'
  assert.strictEqual(inspectedOutput, expectedOutput)
})
