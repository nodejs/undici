'use strict'

const { test } = require('tap')
const { fetch } = require('../..')
const { URL } = require('url')
const { Blob } = require('buffer')

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

  t.test('a normal fetch request works', async (t) => {
    const res = await fetch(objectURL)

    t.equal(blobContents, await res.text())
    t.equal(blob.type, res.headers.get('Content-Type'))
    t.equal(`${blob.size}`, res.headers.get('Content-Length'))
    t.end()
  })

  t.test('non-GET method to blob: fails', async (t) => {
    try {
      await fetch(objectURL, {
        method: 'POST'
      })
      t.fail('expected POST to blob: uri to fail')
    } catch (e) {
      t.ok(e, 'Got the expected error')
    } finally {
      t.end()
    }
  })

  // https://github.com/web-platform-tests/wpt/blob/7b0ebaccc62b566a1965396e5be7bb2bc06f841f/FileAPI/url/resources/fetch-tests.js#L36-L41
  t.test('fetching revoked URL should fail', async (t) => {
    URL.revokeObjectURL(objectURL)

    try {
      await fetch(objectURL)
      t.fail('expected revoked blob: url to fail')
    } catch (e) {
      t.ok(e, 'Got the expected error')
    } finally {
      t.end()
    }
  })

  // https://github.com/web-platform-tests/wpt/blob/7b0ebaccc62b566a1965396e5be7bb2bc06f841f/FileAPI/url/resources/fetch-tests.js#L28-L34
  t.test('works with a fragment', async (t) => {
    const res = await fetch(objectURL + '#fragment')

    t.equal(blobContents, await res.text())
    t.end()
  })

  // https://github.com/web-platform-tests/wpt/blob/7b0ebaccc62b566a1965396e5be7bb2bc06f841f/FileAPI/url/resources/fetch-tests.js#L52-L56
  t.test('Appending a query string to blob: url should cause fetch to fail', async (t) => {
    try {
      await fetch(objectURL + '?querystring')
      t.fail('expected ?querystring blob: url to fail')
    } catch (e) {
      t.ok(e, 'Got the expected error')
    } finally {
      t.end()
    }
  })

  // https://github.com/web-platform-tests/wpt/blob/7b0ebaccc62b566a1965396e5be7bb2bc06f841f/FileAPI/url/resources/fetch-tests.js#L58-L62
  t.test('Appending a path should cause fetch to fail', async (t) => {
    try {
      await fetch(objectURL + '/path')
      t.fail('expected /path blob: url to fail')
    } catch (e) {
      t.ok(e, 'Got the expected error')
    } finally {
      t.end()
    }
  })

  // https://github.com/web-platform-tests/wpt/blob/7b0ebaccc62b566a1965396e5be7bb2bc06f841f/FileAPI/url/resources/fetch-tests.js#L64-L70
  t.test('these http methods should fail', async (t) => {
    for (const method of ['HEAD', 'POST', 'DELETE', 'OPTIONS', 'PUT', 'CUSTOM']) {
      try {
        await fetch(objectURL, { method })
        t.fail(`${method} fetch should have failed`)
      } catch (e) {
        t.ok(e, `${method} blob url - test succeeded`)
      }
    }

    t.end()
  })
})
