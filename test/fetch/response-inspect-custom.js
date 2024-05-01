'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert')
const util = require('node:util')
const { Response } = require('../../')

describe('Response custom inspection', () => {
  it('should return a custom inspect output', () => {
    const response = new Response(null)
    const inspectedOutput = util.inspect(response, {
      depth: null,
      getters: true
    })

    const expectedOutput = `Response {
  status: 200,
  statusText: '',
  headers: Headers {},
  body: null,
  bodyUsed: false,
  ok: true,
  redirected: false,
  type: 'default',
  url: ''
}`

    assert.strictEqual(inspectedOutput, expectedOutput)
  })
})
