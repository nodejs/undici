'use strict'

const { test } = require('tap')
const { fetch } = require('../..')

test('fetch with signal already aborted', async (t) => {
  await t.rejects(fetch('http://localhost', { signal: AbortSignal.abort('Already aborted') }), 'Already aborted')
})
