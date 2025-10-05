'use strict'

const { test } = require('node:test')
const { Request, Agent } = require('../..')
const { getRequestDispatcher } = require('../../lib/web/fetch/request')

test('Cloned request should inherit its dispatcher', (t) => {
  const agent = new Agent()
  const request = new Request('https://a', { dispatcher: agent })
  t.assert.strictEqual(getRequestDispatcher(request), agent)
})
