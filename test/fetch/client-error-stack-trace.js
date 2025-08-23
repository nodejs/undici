'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { sep } = require('node:path')
const { fetch, setGlobalDispatcher, Agent } = require('../..')
const { fetch: fetchIndex } = require('../../index-fetch')

setGlobalDispatcher(new Agent({
  headersTimeout: 500,
  connectTimeout: 500
}))

test('FETCH: request errors and prints trimmed stack trace', async (t) => {
  try {
    await fetch('http://a.com')
  } catch (error) {
    const stackLines = error.stack.split('\n')
    assert.ok(stackLines[0].includes('TypeError: fetch failed'))
    assert.ok(stackLines[1].includes(`undici${sep}index.js`))
    assert.ok(stackLines[2].includes('at process.processTicksAndRejections'))
    assert.ok(stackLines[3].includes(`at async TestContext.<anonymous> (${__filename}`))
  }
})

test('FETCH-index: request errors and prints trimmed stack trace', async (t) => {
  try {
    await fetchIndex('http://a.com')
  } catch (error) {
    const stackLines = error.stack.split('\n')
    assert.ok(stackLines[0].includes('TypeError: fetch failed'))
    assert.ok(stackLines[1].includes(`undici${sep}index-fetch.js`))
    assert.ok(stackLines[2].includes('at process.processTicksAndRejections'))
    assert.ok(stackLines[3].includes(`at async TestContext.<anonymous> (${__filename}`))
  }
})
