'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { Request, Agent } = require('../..')
const { kDispatcher } = require('../../lib/web/fetch/symbols')

test('Cloned request should inherit its dispatcher', () => {
  const agent = new Agent()
  const request = new Request('https://a', { dispatcher: agent })
  assert.strictEqual(request[kDispatcher], agent)
})
