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

test('#5638 - h2 CONNECT settles after GOAWAY(lastStreamID=0)', { timeout: 5000 }, async (t) => {
  const server = net.createServer((socket) => {
    let buf = Buffer.alloc(0)
    let preface = false
    let sent = false

    socket.on('error', () => {})
    socket.write(SETTINGS)

    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk])
      if (!preface) {
        if (buf.length < 24) return
        buf = buf.subarray(24)
        preface = true
      }

      while (buf.length >= 9) {
        const length = buf.readUIntBE(0, 3)
        const type = buf[3]
        const flags = buf[4]
        if (buf.length < 9 + length) break
        buf = buf.subarray(9 + length)

        if (type === 0x4 && !(flags & 0x1)) socket.write(SETTINGS_ACK)
        if (type === 0x1 && !sent) {
          sent = true
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

  await assert.rejects(client.connect({ path: '/' }), {
    code: 'UND_ERR_SOCKET',
    message: 'HTTP/2: "GOAWAY" frame received with code 0'
  })
})
