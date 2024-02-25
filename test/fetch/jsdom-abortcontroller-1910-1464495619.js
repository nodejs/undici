'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { fetch } = require('../..')
const { JSDOM } = require('jsdom')

// https://github.com/nodejs/undici/pull/1910#issuecomment-1464495619
test('third party AbortControllers', async (t) => {
  const server = createServer((_, res) => res.end()).listen(0)

  const { AbortController } = new JSDOM().window
  let controller = new AbortController()

  t.after(() => {
    controller.abort()
    controller = null
    return server.close()
  })
  await once(server, 'listening')

  await assert.doesNotReject(fetch(`http://localhost:${server.address().port}`, {
    signal: controller.signal
  }))
})
