'use strict'

const { describe, it } = require('node:test')
const assert = require('assert')
const util = require('util')
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
  headers: HeadersList {
    cookies: null,
    [Symbol(headers map)]: Map(0) {},
    [Symbol(headers map sorted)]: null
  },
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
