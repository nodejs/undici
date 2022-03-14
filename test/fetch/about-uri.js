'use strict'

const { test } = require('tap')
const { fetch } = require('../..')

test('fetching about: uris', async (t) => {
  t.test('about:blank', async (t) => {
    const res = await fetch('about:blank')

    t.equal(res.url, 'about:blank')
    t.equal(res.statusText, 'OK')
    t.equal(res.headers.get('Content-Type'), 'text/html;charset=utf-8')
    t.end()
  })

  t.test('All other about: urls should return an error', async (t) => {
    try {
      await fetch('about:config')
      t.fail('fetching about:config should fail')
    } catch (e) {
      t.ok(e, 'this error was expected')
    } finally {
      t.end()
    }
  })
})
