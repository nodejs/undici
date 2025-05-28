'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { fetch } = require('../..')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { Readable, pipeline } = require('node:stream')
const { setTimeout: sleep } = require('node:timers/promises')

const { closeServerAsPromise } = require('../utils/node-http')

test('pull dont\'t push', async (t) => {
  let count = 0
  let socket
  const max = 1_000_000
  const server = createServer((req, res) => {
    res.statusCode = 200
    socket = res.socket

    // infinite stream
    const stream = new Readable({
      read () {
        this.push('a')
        if (count++ > max) {
          this.push(null)
        }
      }
    })

    pipeline(stream, res, () => {})
  })

  t.after(closeServerAsPromise(server))

  server.listen(0)
  await once(server, 'listening')

  const res = await fetch(`http://localhost:${server.address().port}`)

  // Some time is needed to fill the buffer
  await sleep(1000)

  socket.destroy()
  assert.strictEqual(count < max, true) // the stream should be closed before the max

  // consume the  stream
  try {
    /* eslint-disable-next-line no-unused-vars */
    for await (const chunk of res.body) {
      // process._rawDebug('chunk', chunk)
    }
  } catch {}
})
