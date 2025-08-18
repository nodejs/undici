'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { Request, Agent } = require('../..')
const { getRequestDispatcher } = require('../../lib/web/fetch/request')

test('Cloned request should inherit its dispatcher', () => {
  const agent = new Agent()
  const request = new Request('https://a', { dispatcher: agent })
  assert.strictEqual(getRequestDispatcher(request), agent)
})
