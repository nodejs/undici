'use strict'

const { test } = require('node:test')
const { EventEmitter } = require('node:events')
const { ByteParser } = require('../../lib/web/websocket/receiver')
const { states } = require('../../lib/web/websocket/constants')

// An unmasked, empty PING frame as sent by a server (FIN + opcode 0x9).
const serverPingFrame = Buffer.from([0x89, 0x00])

// A socket stub whose writes report backpressure (write() returns false and
// writableNeedDrain stays set) until drain() is called.
function createBackpressuredSocket () {
  const socket = new EventEmitter()
  socket.pongWrites = 0
  socket.blocked = true
  socket.writableNeedDrain = false
  socket.write = () => {
    socket.pongWrites += 1
    if (socket.blocked) {
      socket.writableNeedDrain = true
      return false
    }
    return true
  }
  socket.drain = () => {
    socket.writableNeedDrain = false
    socket.emit('drain')
  }
  return socket
}

function createPingHandler (socket) {
  return {
    readyState: states.OPEN,
    socket,
    closeState: new Set(),
    onPing () {}
  }
}

test('ByteParser stops auto-writing PONGs once the socket applies backpressure', (t) => {
  const socket = createBackpressuredSocket()
  const parser = new ByteParser(createPingHandler(socket))
  const pingFlood = Buffer.concat(Array.from({ length: 50 }, () => serverPingFrame))

  parser.write(pingFlood)

  return new Promise((resolve) => {
    setImmediate(() => {
      t.assert.strictEqual(socket.pongWrites, 1)
      parser.destroy()
      resolve()
    })
  })
})

test('ByteParser resumes auto-writing PONGs after the socket drains', (t) => {
  const socket = createBackpressuredSocket()
  const parser = new ByteParser(createPingHandler(socket))
  const pingFlood = Buffer.concat(Array.from({ length: 50 }, () => serverPingFrame))

  parser.write(pingFlood)

  return new Promise((resolve) => {
    setImmediate(() => {
      t.assert.strictEqual(socket.pongWrites, 1)

      socket.blocked = false
      socket.drain()

      setImmediate(() => {
        t.assert.strictEqual(socket.pongWrites, 50)
        parser.destroy()
        resolve()
      })
    })
  })
})

test('ByteParser does not resume PONG writes if destroyed while paused', (t) => {
  const socket = createBackpressuredSocket()
  const parser = new ByteParser(createPingHandler(socket))
  const pingFlood = Buffer.concat(Array.from({ length: 50 }, () => serverPingFrame))

  parser.write(pingFlood)

  return new Promise((resolve) => {
    setImmediate(() => {
      t.assert.strictEqual(socket.pongWrites, 1)

      parser.destroy()
      socket.blocked = false
      socket.drain()

      setImmediate(() => {
        t.assert.strictEqual(socket.pongWrites, 1)
        resolve()
      })
    })
  })
})
