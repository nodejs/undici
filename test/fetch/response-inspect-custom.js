'use strict'

const { describe, it } = require('node:test')
const assert = require('assert')
const util = require('util')
const { Response } = require('../../')

describe('Response custom inspection', () => {
  it('should return a custom inspect output', () => {
    const response = new Response(null)
    const inspectedOutput = util.inspect(response)
    const expectedOutput = `Response {
  status: 200,
  statusText: '',
  headers: HeadersList {
    cookies: null,
    [Symbol(headers map)]: Map(0) {},
    [Symbol(headers map sorted)]: null
  }
}`
    assert.strictEqual(inspectedOutput, expectedOutput)
  })
})
