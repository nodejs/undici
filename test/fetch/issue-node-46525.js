'use strict'

const { once } = require('node:events')
const { createServer } = require('node:http')
const { test } = require('node:test')
const { fetch } = require('../..')
const util = require('../../lib/core/util')

// https://github.com/nodejs/node/commit/d4736060404726a24d4e52647b8c9b88914b8ddf
const isFixedOrderAbortSignalAny = typeof AbortSignal.any === 'function' && util.nodeMajor >= 23

// TODO: Drop support below node v23, then delete this.
// https://github.com/nodejs/node/issues/46525
test('No warning when reusing AbortController', { skip: isFixedOrderAbortSignalAny }, async (t) => {
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
