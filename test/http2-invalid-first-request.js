'use strict'

const assert = require('node:assert/strict')
const { once } = require('node:events')
const { createSecureServer } = require('node:http2')
const { test } = require('node:test')
const pem = require('@metcoder95/https-pem')
const { Agent, Pool } = require('..')

const common = {
  mustCall (t, callback, expected) {
    let calls = 0
    t.after(() => assert.equal(calls, expected))
    return (...args) => {
      calls++
      return callback(...args)
    }
  }
}

test('a rejected first request does not strand the HTTP/2 protocol probe', async t => {
  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  server.on('stream', common.mustCall(t, stream => {
    stream.respond({ ':status': 200 })
    stream.end('ok')
  }, 4))
  await once(server.listen(0), 'listening')
  t.after(() => server.close())

  const origin = `https://localhost:${server.address().port}`
  for (const Dispatcher of [Agent, Pool]) {
    for (const [invalidOptions, code] of [
      [{ path: '/', headers: { expect: '100-continue' } }, 'UND_ERR_NOT_SUPPORTED'],
      [{ path: 'relative' }, 'UND_ERR_INVALID_ARG']
    ]) {
      const options = { allowH2: true, connect: { rejectUnauthorized: false } }
      const dispatcher = Dispatcher === Agent ? new Agent(options) : new Pool(origin, options)
      try {
        await assert.rejects(dispatcher.request({ origin, method: 'GET', ...invalidOptions }), { code })
        const response = await dispatcher.request({ origin, path: '/', method: 'GET' })
        assert.equal(response.statusCode, 200)
        assert.equal(await response.body.text(), 'ok')
      } finally {
        await dispatcher.destroy()
      }
    }
  }
})
