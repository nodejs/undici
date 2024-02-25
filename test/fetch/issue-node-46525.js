'use strict'

const { once } = require('node:events')
const { createServer } = require('node:http')
const { test } = require('node:test')
const { fetch } = require('../..')

// https://github.com/nodejs/node/issues/46525
test('No warning when reusing AbortController', async (t) => {
  function onWarning () {
    throw new Error('Got warning')
  }

  const server = createServer((req, res) => res.end()).listen(0)

  await once(server, 'listening')

  process.on('warning', onWarning)
  t.after(() => {
    process.off('warning', onWarning)
    return server.close()
  })

  const controller = new AbortController()
  for (let i = 0; i < 15; i++) {
    await fetch(`http://localhost:${server.address().port}`, { signal: controller.signal })
  }
})
