'use strict'

const { test } = require('node:test')
const undiciFetch = require('../../undici-fetch')

test('EnvHttpProxyAgent should be part of Node.js bundle', (t) => {
  t.assert.strictEqual(typeof undiciFetch.EnvHttpProxyAgent, 'function')
  t.assert.strictEqual(typeof undiciFetch.getGlobalDispatcher, 'function')
  t.assert.strictEqual(typeof undiciFetch.setGlobalDispatcher, 'function')

  const agent = new undiciFetch.EnvHttpProxyAgent()
  undiciFetch.setGlobalDispatcher(agent)
  t.assert.strictEqual(undiciFetch.getGlobalDispatcher(), agent)
})
