'use strict'

const { describe, it } = require('node:test')
const util = require('node:util')
const { Response } = require('../../')

describe('Response custom inspection', () => {
  it('should return a custom inspect output', (t) => {
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

    t.assert.strictEqual(inspectedOutput, expectedOutput)
  })
})
