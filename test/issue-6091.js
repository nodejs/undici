'use strict'

const { test } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { fetch, FormData } = require('..')

// https://github.com/nodejs/undici/issues/6091

test('fetch with a FormData body and an aborted signal rejects without an unhandled rejection', { timeout: 60000 }, async (t) => {
  const unhandled = []
  const onUnhandledRejection = (err) => unhandled.push(err.message)
  process.on('unhandledRejection', onUnhandledRejection)
  t.after(() => process.off('unhandledRejection', onUnhandledRejection))

  const server = createServer((req, res) => req.resume().on('end', () => res.end('ok')))
  t.after(() => { server.closeAllConnections?.(); server.close() })
  server.listen(0)
  await once(server, 'listening')

  const form = new FormData()
  form.set('a', 'b')
  const controller = new AbortController()
  controller.abort()

  await t.assert.rejects(
    fetch(`http://localhost:${server.address().port}`, { method: 'POST', body: form, signal: controller.signal }),
    { name: 'AbortError' }
  )

  // Let the detached body loop run against the cancelled stream.
  await new Promise((resolve) => setTimeout(resolve, 50))
  t.assert.deepStrictEqual(unhandled, [])
})
