'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { fetch } = require('../..')
const { createServer } = require('http')
const { once } = require('events')
const { Readable, pipeline } = require('stream')
const { setTimeout: sleep } = require('timers/promises')

const { closeServerAsPromise } = require('../utils/node-http')

test('Allow the usage of custom implementation of AbortController', async (t) => {
  let count = 0
  let socket
  const server = createServer((req, res) => {
    res.statusCode = 200
    socket = res.socket

    // infinite stream
    const stream = new Readable({
      read () {
        this.push('a')
        if (count++ > 1000000) {
          this.push(null)
        }
      }
    })

    pipeline(stream, res, () => {})
  })

  t.after(closeServerAsPromise(server))

  server.listen(0)
  await once(server, 'listening')

  t.diagnostic('server listening on port %d', server.address().port)
  const res = await fetch(`http://localhost:${server.address().port}`)
  t.diagnostic('fetched')

  // Some time is needed to fill the buffer
  await sleep(1000)

  assert.strictEqual(socket.bytesWritten < 1024 * 1024, true) // 1 MB
  socket.destroy()

  // consume the  stream
  try {
    /* eslint-disable-next-line no-empty, no-unused-vars */
    for await (const chunk of res.body) {}
  } catch {}
})
