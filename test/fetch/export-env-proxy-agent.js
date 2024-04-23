'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const undiciFetch = require('../../undici-fetch')

test('EnvHttpProxyAgent should be part of Node.js bundle', () => {
  assert.strictEqual(typeof undiciFetch.EnvHttpProxyAgent, 'function')
  assert.strictEqual(typeof undiciFetch.getGlobalDispatcher, 'function')
  assert.strictEqual(typeof undiciFetch.setGlobalDispatcher, 'function')

  const agent = new undiciFetch.EnvHttpProxyAgent()
  undiciFetch.setGlobalDispatcher(agent)
  assert.strictEqual(undiciFetch.getGlobalDispatcher(), agent)
})
