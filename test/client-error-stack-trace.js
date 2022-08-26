'use strict'

const { test } = require('tap')
const { fetch } = require('..')

test('Request errors and prints trimmed stack trace', async (t) => {
  try {
    await fetch('http://a.com')
  } catch (error) {
    t.match(error.stack, `at Test.<anonymous> (${__filename}`)
  }
})
