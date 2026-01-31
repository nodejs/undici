'use strict'

const { test } = require('node:test')
const undiciFetch = require('../../undici-fetch')

test('EnvHttpProxyAgent should be part of Node.js bundle', (t) => {
  t.assert.strictEqual(typeof undiciFetch.EnvHttpProxyAgent, 'function')
  t.assert.strictEqual(typeof undiciFetch.getGlobalDispatcher, 'function')
  t.assert.strictEqual(typeof undiciFetch.setGlobalDispatcher, 'function')

  const agent = new undiciFetch.EnvHttpProxyAgent()
  const previousDispatcher = undiciFetch.getGlobalDispatcher()
  undiciFetch.setGlobalDispatcher(agent)
  t.after(() => {
    undiciFetch.setGlobalDispatcher(previousDispatcher)
  })
  t.assert.strictEqual(undiciFetch.getGlobalDispatcher(), agent)
})
