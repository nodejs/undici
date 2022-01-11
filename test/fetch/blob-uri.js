'use strict'

const { test } = require('tap')
const { fetch } = require('../..')
const { URL } = require('url')
const { Blob } = require('buffer')

test('fetching blob: uris', async (t) => {
    const blob_contents = 'hello world';

    t.test('a normal fetch request works', async (t) => {
        const blob = new Blob([blob_contents])
        const objectURL = URL.createObjectURL(blob)

        const res = await fetch(objectURL)

        t.equal(blob_contents, await res.text())
        t.equal(blob.type, res.headers.get('Content-Type'))
        t.equal(`${blob.size}`, res.headers.get('Content-Length'))
        t.end()
    })

    t.test('non-GET method to blob: fails', async (t) => {
        const blob = new Blob([blob_contents])
        const objectURL = URL.createObjectURL(blob)

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

    // https://github.com/web-platform-tests/wpt/blob/7b0ebaccc62b566a1965396e5be7bb2bc06f841f/FileAPI/url/resources/fetch-tests.js#L28-L34
    t.test('works with a fragment', async (t) => {
        const blob = new Blob([blob_contents])
        const objectURL = URL.createObjectURL(blob)

        const res = await fetch(objectURL + '#fragment')

        t.equal(blob_contents, await res.text())
        t.end()
    })
})
