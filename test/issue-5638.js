'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const net = require('node:net')
const { H2CClient } = require('..')

const frame = (type, flags, streamId, payload = Buffer.alloc(0)) => {
  const head = Buffer.alloc(9)
  head.writeUIntBE(payload.length, 0, 3)
  head[3] = type
  head[4] = flags
  head.writeUInt32BE(streamId, 5)
  return Buffer.concat([head, payload])
}

const SETTINGS = frame(0x4, 0x0, 0)
const SETTINGS_ACK = frame(0x4, 0x1, 0)
const GOAWAY = frame(0x7, 0x0, 0, Buffer.alloc(8))

test('h2 CONNECT settles when GOAWAY names an older stream', { timeout: 30000 }, async (t) => {
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0)
    let receivedPreface = false
    let sentGoAway = false

    socket.on('error', () => {})
    socket.write(SETTINGS)

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])
      if (!receivedPreface) {
        if (buffer.length < 24) return
        buffer = buffer.subarray(24)
        receivedPreface = true
      }

      while (buffer.length >= 9) {
        const length = buffer.readUIntBE(0, 3)
        const type = buffer[3]
        const flags = buffer[4]
        if (buffer.length < 9 + length) break
        buffer = buffer.subarray(9 + length)

        if (type === 0x4 && !(flags & 0x1)) socket.write(SETTINGS_ACK)
        if (type === 0x1 && !sentGoAway) {
          sentGoAway = true
          socket.write(GOAWAY)
          setTimeout(() => socket.end(), 50)
        }
      }
    })
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())

  const client = new H2CClient(`http://127.0.0.1:${server.address().port}`)
  t.after(() => client.close())

  await assert.rejects(client.connect({ path: '/' }))
})
