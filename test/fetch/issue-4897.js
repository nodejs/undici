'use strict'

const { test } = require('node:test')
const { fetch } = require('../..')

function createAssertingDispatcher (t, expectedPath) {
  return {
    dispatch (opts, handler) {
      t.assert.strictEqual(opts.path, expectedPath)
      handler.onResponseError(null, new Error('stop'))
      return true
    }
  }
}

async function assertPath (t, url, expectedPath) {
  const dispatcher = createAssertingDispatcher(t, expectedPath)

  await t.assert.rejects(fetch(url, { dispatcher }), (err) => {
    t.assert.strictEqual(err.cause?.message, 'stop')
    return true
  })
}

async function assertCredentialsRejected (t, url) {
  const dispatcher = createAssertingDispatcher(t, '/test?a=b')

  await t.assert.rejects(fetch(url, { dispatcher }), (err) => {
    t.assert.strictEqual(err.name, 'TypeError')
    t.assert.match(err.message, /includes credentials/)
    return true
  })
}

// https://github.com/nodejs/undici/issues/4897
test('fetch path extraction does not match hostnames inside scheme', async (t) => {
  const hosts = ['h', 't', 'p', 'ht', 'tp', 'tt']

  for (const scheme of ['http', 'https']) {
    for (const userinfo of ['', 'user:pass@']) {
      for (const host of hosts) {
        await t.test(`${scheme}://${userinfo}${host}/test?a=b#frag`, async (t) => {
          const url = `${scheme}://${userinfo}${host}/test?a=b#frag`

          if (userinfo) {
            await assertCredentialsRejected(t, url)
          } else {
            await assertPath(t, url, '/test?a=b')
          }
        })
      }
    }
  }
})
