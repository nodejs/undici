'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { fetch } = require('../..')
const { fetch: fetchIndex } = require('../../index-fetch')

test('FETCH: request errors and prints trimmed stack trace', async (t) => {
  try {
    await fetch('http://a.com')
  } catch (error) {
    assert.ok(error.stack.includes(`at async TestContext.<anonymous> (${__filename}`))
  }
})

test('FETCH-index: request errors and prints trimmed stack trace', async (t) => {
  try {
    await fetchIndex('http://a.com')
  } catch (error) {
    assert.ok(error.stack.includes(`at async TestContext.<anonymous> (${__filename}`))
  }
})
