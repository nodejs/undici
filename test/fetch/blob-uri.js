'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { fetch } = require('../..')
const { Blob } = require('node:buffer')

test('fetching blob: uris', async (t) => {
  const blobContents = 'hello world'
  /** @type {import('buffer').Blob} */
  let blob
  /** @type {string} */
  let objectURL

  t.beforeEach(() => {
    blob = new Blob([blobContents])
    objectURL = URL.createObjectURL(blob)
  })

  await t.test('a normal fetch request works', async () => {
    const res = await fetch(objectURL)

    assert.strictEqual(blobContents, await res.text())
    assert.strictEqual(blob.type, res.headers.get('Content-Type'))
    assert.strictEqual(`${blob.size}`, res.headers.get('Content-Length'))
  })

  await t.test('non-GET method to blob: fails', async () => {
    try {
      await fetch(objectURL, {
        method: 'POST'
      })
      assert.fail('expected POST to blob: uri to fail')
    } catch (e) {
      assert.ok(e, 'Got the expected error')
    }
  })

  // https://github.com/web-platform-tests/wpt/blob/7b0ebaccc62b566a1965396e5be7bb2bc06f841f/FileAPI/url/resources/fetch-tests.js#L36-L41
  await t.test('fetching revoked URL should fail', async () => {
    URL.revokeObjectURL(objectURL)

    try {
      await fetch(objectURL)
      assert.fail('expected revoked blob: url to fail')
    } catch (e) {
      assert.ok(e, 'Got the expected error')
    }
  })

  // https://github.com/web-platform-tests/wpt/blob/7b0ebaccc62b566a1965396e5be7bb2bc06f841f/FileAPI/url/resources/fetch-tests.js#L28-L34
  await t.test('works with a fragment', async () => {
    const res = await fetch(objectURL + '#fragment')

    assert.strictEqual(blobContents, await res.text())
  })

  // https://github.com/web-platform-tests/wpt/blob/7b0ebaccc62b566a1965396e5be7bb2bc06f841f/FileAPI/url/resources/fetch-tests.js#L52-L56
  await t.test('Appending a query string to blob: url should cause fetch to fail', async () => {
    try {
      await fetch(objectURL + '?querystring')
      assert.fail('expected ?querystring blob: url to fail')
    } catch (e) {
      assert.ok(e, 'Got the expected error')
    }
  })

  // https://github.com/web-platform-tests/wpt/blob/7b0ebaccc62b566a1965396e5be7bb2bc06f841f/FileAPI/url/resources/fetch-tests.js#L58-L62
  await t.test('Appending a path should cause fetch to fail', async () => {
    try {
      await fetch(objectURL + '/path')
      assert.fail('expected /path blob: url to fail')
    } catch (e) {
      assert.ok(e, 'Got the expected error')
    }
  })

  // https://github.com/web-platform-tests/wpt/blob/7b0ebaccc62b566a1965396e5be7bb2bc06f841f/FileAPI/url/resources/fetch-tests.js#L64-L70
  await t.test('these http methods should fail', async () => {
    for (const method of ['HEAD', 'POST', 'DELETE', 'OPTIONS', 'PUT', 'CUSTOM']) {
      try {
        await fetch(objectURL, { method })
        assert.fail(`${method} fetch should have failed`)
      } catch (e) {
        assert.ok(e, `${method} blob url - test succeeded`)
      }
    }
  })
})
