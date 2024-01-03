'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { fetch } = require('../..')

test('fetch with signal already aborted', async () => {
  await assert.rejects(
    fetch('http://localhost', {
      signal: AbortSignal.abort('Already aborted')
    }),
    /Already aborted/
  )
})
