'use strict'

const { once } = require('events')
const { createServer } = require('http')
const { test } = require('tap')
const { fetch } = require('../..')

// https://github.com/nodejs/node/issues/46525
test('No warning when reusing AbortController', async (t) => {
  function onWarning (error) {
    t.error(error, 'Got warning')
  }

  const server = createServer((req, res) => res.end()).listen(0)

  await once(server, 'listening')

  process.on('warning', onWarning)
  t.teardown(() => {
    process.off('warning', onWarning)
    return server.close()
  })

  const controller = new AbortController()
  for (let i = 0; i < 15; i++) {
    await fetch(`http://localhost:${server.address().port}`, { signal: controller.signal })
  }
})
