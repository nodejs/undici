'use strict'

const { test } = require('node:test')
const { fetch } = require('../..')

test('fetching blob: uris', async (t) => {
  const blobContents = 'hello world'
  /** @type {Blob} */
  let blob
  /** @type {string} */
  let objectURL

  t.beforeEach(() => {
    blob = new Blob([blobContents])
    objectURL = URL.createObjectURL(blob)
  })

  await t.test('a normal fetch request works', async () => {
    const res = await fetch(objectURL)

    t.assert.strictEqual(blobContents, await res.text())
    t.assert.strictEqual(blob.type, res.headers.get('Content-Type'))
    t.assert.strictEqual(`${blob.size}`, res.headers.get('Content-Length'))
  })

  await t.test('non-GET method to blob: fails', async () => {
    try {
      await fetch(objectURL, {
        method: 'POST'
      })
      t.assert.fail('expected POST to blob: uri to fail')
    } catch (e) {
      t.assert.ok(e, 'Got the expected error')
    }
  })

  // https://github.com/web-platform-tests/wpt/blob/7b0ebaccc62b566a1965396e5be7bb2bc06f841f/FileAPI/url/resources/fetch-tests.js#L36-L41
  await t.test('fetching revoked URL should fail', async () => {
    URL.revokeObjectURL(objectURL)

    try {
      await fetch(objectURL)
      t.assert.fail('expected revoked blob: url to fail')
    } catch (e) {
      t.assert.ok(e, 'Got the expected error')
    }
  })

  // https://github.com/web-platform-tests/wpt/blob/7b0ebaccc62b566a1965396e5be7bb2bc06f841f/FileAPI/url/resources/fetch-tests.js#L28-L34
  await t.test('works with a fragment', async () => {
    const res = await fetch(objectURL + '#fragment')

    t.assert.strictEqual(blobContents, await res.text())
  })

  // https://github.com/web-platform-tests/wpt/blob/7b0ebaccc62b566a1965396e5be7bb2bc06f841f/FileAPI/url/resources/fetch-tests.js#L52-L56
  await t.test('Appending a query string to blob: url should cause fetch to fail', async () => {
    try {
      await fetch(objectURL + '?querystring')
      t.assert.fail('expected ?querystring blob: url to fail')
    } catch (e) {
      t.assert.ok(e, 'Got the expected error')
    }
  })

  // https://github.com/web-platform-tests/wpt/blob/7b0ebaccc62b566a1965396e5be7bb2bc06f841f/FileAPI/url/resources/fetch-tests.js#L58-L62
  await t.test('Appending a path should cause fetch to fail', async () => {
    try {
      await fetch(objectURL + '/path')
      t.assert.fail('expected /path blob: url to fail')
    } catch (e) {
      t.assert.ok(e, 'Got the expected error')
    }
  })

  // https://github.com/web-platform-tests/wpt/blob/7b0ebaccc62b566a1965396e5be7bb2bc06f841f/FileAPI/url/resources/fetch-tests.js#L64-L70
  await t.test('these http methods should fail', async () => {
    for (const method of ['HEAD', 'POST', 'DELETE', 'OPTIONS', 'PUT', 'CUSTOM']) {
      try {
        await fetch(objectURL, { method })
        t.assert.fail(`${method} fetch should have failed`)
      } catch (e) {
        t.assert.ok(e, `${method} blob url - test succeeded`)
      }
    }
  })
})
