'use strict'

const { test } = require('tap')
const { fetch } = require('../..')
const { fetch: fetchIndex } = require('../../index-fetch')

test('FETCH: request errors and prints trimmed stack trace', async (t) => {
  try {
    await fetch('http://a.com')
  } catch (error) {
    t.match(error.stack, `at Test.<anonymous> (${__filename}`)
  }
})

test('FETCH-index: request errors and prints trimmed stack trace', async (t) => {
  try {
    await fetchIndex('http://a.com')
  } catch (error) {
    t.match(error.stack, `at Test.<anonymous> (${__filename}`)
  }
})
