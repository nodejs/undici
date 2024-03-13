'use strict'

const { describe, it } = require('node:test')
const assert = require('assert')
const util = require('util')
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

    const expectedOutput = `{
  method: 'POST',
  url: 'https://example.com/api',
  headers: Headers { 'Content-Type': 'application/json' },
  destination: '',
  referrer: 'about:client',
  referrerPolicy: '',
  mode: 'cors',
  credentials: 'same-origin',
  cache: 'default',
  redirect: 'follow',
  integrity: '',
  keepalive: false,
  isReloadNavigation: false,
  isHistoryNavigation: false,
  signal: AbortSignal { aborted: false },
  body: null,
  bodyUsed: false,
  ok: undefined,
  redirected: undefined,
  status: undefined,
  statusText: undefined,
  type: undefined
}`

    assert.strictEqual(inspectedOutput, expectedOutput)
  })
})
