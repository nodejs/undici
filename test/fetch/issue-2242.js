'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { fetch } = require('../..')
const nodeFetch = require('../../index-fetch')

test('fetch with signal already aborted', async () => {
  await assert.rejects(
    fetch('http://localhost', {
      signal: AbortSignal.abort('Already aborted')
    }),
    /Already aborted/
  )
})

test('fetch with signal already aborted (from index-fetch)', async () => {
  await assert.rejects(
    nodeFetch.fetch('http://localhost', {
      signal: AbortSignal.abort('Already aborted')
    }),
    /Already aborted/
  )
})
