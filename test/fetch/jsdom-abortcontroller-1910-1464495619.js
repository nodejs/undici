'use strict'

const { test } = require('tap')
const { createServer } = require('http')
const { once } = require('events')
const { fetch } = require('../..')
const { JSDOM } = require('jsdom')

// https://github.com/nodejs/undici/pull/1910#issuecomment-1464495619
test('third party AbortControllers', async (t) => {
  const server = createServer((_, res) => res.end()).listen(0)

  t.teardown(server.close.bind(server))
  await once(server, 'listening')

  const { AbortController } = new JSDOM().window
  const controller = new AbortController()

  await t.resolves(fetch(`http://localhost:${server.address().port}`, {
    signal: controller.signal
  }))
})
