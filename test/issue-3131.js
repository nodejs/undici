'use strict'

const { createServer } = require('node:http')
const { EventEmitter, once } = require('node:events')
const { request } = require('../')
const { test } = require('node:test')
const { closeServerAsPromise } = require('./utils/node-http')
const { strictEqual } = require('node:assert')

test('issue #3131', async (t) => {
  const emitter = new EventEmitter()

  const server = createServer((req, res) => {
    res.end('Hi')
  })

  server.listen(0)

  await once(server, 'listening')

  t.after(closeServerAsPromise(server))

  const url = `http://localhost:${server.address().port}`

  let warningEmitted = false
  function onWarning () {
    warningEmitted = true
  }
  process.on('warning', onWarning)
  t.after(() => {
    process.off('warning', onWarning)
  })

  const promises = new Array(50)

  for (let i = 0; i < promises.length; ++i) {
    promises[i] = request(url, { signal: emitter })
  }

  await Promise.all(promises)

  strictEqual(warningEmitted, false)
})
