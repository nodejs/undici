'use strict'

const { fetch } = require('../../..')
const { test } = require('node:test')
const { pathToFileURL } = require('node:url')
const { join } = require('node:path')
const assert = require('node:assert')

test('fetching a file url works', async () => {
  const url = new URL(join(pathToFileURL(__dirname).toString(), 'fetch-file-url.js'))

  await assert.doesNotReject(fetch(url))
})

test('fetching one outside of the permission scope rejects', async (t) => {
  const url = new URL(join(pathToFileURL(process.cwd()).toString(), '..'))

  await assert.rejects(fetch(url), new TypeError('fetch failed'))
})
