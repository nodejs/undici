'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { mkdtemp, writeFile, rm } = require('node:fs/promises')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { pathToFileURL } = require('node:url')

const { Agent, fetch, interceptors } = require('../..')

test('fetch() rejects file URLs by default', async () => {
  const fileURL = pathToFileURL(__filename)

  await assert.rejects(fetch(fileURL), new TypeError('fetch failed'))
})

test('fetch() can read file URLs through a custom file interceptor', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'undici-fetch-file-url-'))
  const filePath = join(dir, 'message.txt')
  await writeFile(filePath, 'hello from file interceptor')

  const dispatcher = new Agent().compose(interceptors.file({
    allow: ({ path }) => path.startsWith(dir)
  }))

  t.after(async () => {
    await dispatcher.close()
    await rm(dir, { recursive: true, force: true })
  })

  const response = await fetch(pathToFileURL(filePath), { dispatcher })

  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'hello from file interceptor')
})

test('fetch() with file interceptor rejects disallowed paths', async (t) => {
  const dispatcher = new Agent().compose(interceptors.file({
    allow: () => false
  }))

  t.after(async () => {
    await dispatcher.close()
  })

  await assert.rejects(fetch(pathToFileURL(__filename), { dispatcher }), new TypeError('fetch failed'))
})
