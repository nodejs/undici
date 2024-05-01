'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert')
const util = require('node:util')
const { Request } = require('../../')

describe('Request custom inspection', () => {
  it('should return a custom inspect output', () => {
    const request = new Request('https://example.com/api', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    const inspectedOutput = util.inspect(request)

    const expectedOutput = "Request {\n  method: 'POST',\n  url: 'https://example.com/api',\n  headers: Headers { 'Content-Type': 'application/json' },\n  destination: '',\n  referrer: 'about:client',\n  referrerPolicy: '',\n  mode: 'cors',\n  credentials: 'same-origin',\n  cache: 'default',\n  redirect: 'follow',\n  integrity: '',\n  keepalive: false,\n  isReloadNavigation: false,\n  isHistoryNavigation: false,\n  signal: AbortSignal { aborted: false }\n}"
    assert.strictEqual(inspectedOutput, expectedOutput)
  })
})
