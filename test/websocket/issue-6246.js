'use strict'

// https://github.com/nodejs/undici/issues/6246
// Multiple frames in one chunk must not dispatch every message event in the
// same turn. WHATWG queues a task per message, so microtasks queued by a
// listener run before the next message.

const { test } = require('node:test')
const { createHash } = require('node:crypto')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { createDeflateRaw, constants } = require('node:zlib')
const { WebSocket } = require('../..')
const { ByteParser } = require('../../lib/web/websocket/receiver')
const { states } = require('../../lib/web/websocket/constants')

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

function frame (opcode, fin, text, { compressed = false } = {}) {
  const payload = Buffer.isBuffer(text) ? text : Buffer.from(text)
  let header = (fin ? 0x80 : 0x00) | opcode
  if (compressed) {
    header |= 0x40
  }

  if (payload.length < 126) {
    return Buffer.concat([
      Buffer.from([header, payload.length]),
      payload
    ])
  }

  const length = Buffer.allocUnsafe(2)
  length.writeUInt16BE(payload.length)
  return Buffer.concat([
    Buffer.from([header, 126]),
    length,
    payload
  ])
}

function textFrame (text) {
  return frame(0x01, true, text)
}

// permessage-deflate: raw deflate, sync flush, strip the 00 00 ff ff tail.
function deflate (data) {
  return new Promise((resolve) => {
    const deflateRaw = createDeflateRaw()
    const chunks = []

    deflateRaw.on('data', (chunk) => chunks.push(chunk))
    deflateRaw.write(data)
    deflateRaw.flush(constants.Z_SYNC_FLUSH, () => {
      const output = Buffer.concat(chunks)
      resolve(output.subarray(0, output.length - 4))
    })
  })
}

async function startWebSocketServer (t, frames, { extensions, end = false } = {}) {
  const sockets = new Set()
  const server = createServer()

  server.on('upgrade', (req, socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))

    const key = req.headers['sec-websocket-key']
    const accept = createHash('sha1').update(key + GUID).digest('base64')
    let response =
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n`
    if (extensions) {
      response += `Sec-WebSocket-Extensions: ${extensions}\r\n`
    }
    response += '\r\n'
    socket.write(response)

    // One write, so the frames arrive in a single chunk.
    setTimeout(() => {
      if (socket.destroyed) {
        return
      }
      const chunk = Buffer.concat(frames)
      if (end) {
        socket.end(chunk)
      } else {
        socket.write(chunk)
      }
    }, 50)
  })

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')

  t.after(() => {
    for (const socket of sockets) socket.destroy()
    server.close()
  })

  return `ws://127.0.0.1:${server.address().port}`
}

test('each uncompressed message is dispatched in its own task', { timeout: 60000 }, async (t) => {
  t.plan(1)

  const url = await startWebSocketServer(t, [
    textFrame('m1'),
    textFrame('m2'),
    textFrame('m3')
  ])
  const ws = new WebSocket(url)
  t.after(() => ws.close())

  const log = []
  await new Promise((resolve) => {
    ws.addEventListener('message', (event) => {
      log.push(event.data)
      queueMicrotask(() => {
        log.push(`microtask(${event.data})`)
        if (event.data === 'm3') resolve()
      })
    })
  })

  t.assert.deepStrictEqual(log, [
    'm1', 'microtask(m1)',
    'm2', 'microtask(m2)',
    'm3', 'microtask(m3)'
  ])
})

test('fragmented uncompressed messages also yield a microtask checkpoint before the next message', { timeout: 60000 }, async (t) => {
  t.plan(1)

  const url = await startWebSocketServer(t, [
    frame(0x01, false, 'm1-'),
    frame(0x00, true, 'end'),
    textFrame('m2')
  ])
  const ws = new WebSocket(url)
  t.after(() => ws.close())

  const log = []
  await new Promise((resolve) => {
    ws.addEventListener('message', (event) => {
      log.push(event.data)
      queueMicrotask(() => {
        log.push(`microtask(${event.data})`)
        if (event.data === 'm2') resolve()
      })
    })
  })

  t.assert.deepStrictEqual(log, [
    'm1-end', 'microtask(m1-end)',
    'm2', 'microtask(m2)'
  ])
})

test('an awaited continuation from one message runs before the next message', { timeout: 60000 }, async (t) => {
  t.plan(1)

  const url = await startWebSocketServer(t, [
    textFrame('first'),
    textFrame('second')
  ])
  const ws = new WebSocket(url)
  t.after(() => ws.close())

  let ready = false
  const seenBySecond = new Promise((resolve) => {
    ws.addEventListener('message', async (event) => {
      if (event.data === 'first') {
        await null
        ready = true
      } else {
        resolve(ready)
      }
    })
  })

  t.assert.strictEqual(await seenBySecond, true)
})

test('nested microtasks from one message run before the next message', { timeout: 60000 }, async (t) => {
  t.plan(1)

  const url = await startWebSocketServer(t, [
    textFrame('m1'),
    textFrame('m2')
  ])
  const ws = new WebSocket(url)
  t.after(() => ws.close())

  const log = []
  await new Promise((resolve) => {
    ws.addEventListener('message', (event) => {
      log.push(event.data)
      queueMicrotask(() => {
        queueMicrotask(() => {
          log.push(`microtask(${event.data})`)
          if (event.data === 'm2') resolve()
        })
      })
    })
  })

  t.assert.deepStrictEqual(log, [
    'm1', 'microtask(m1)',
    'm2', 'microtask(m2)'
  ])
})

test('a compressed message yields before a following message in the same chunk', { timeout: 60000 }, async (t) => {
  t.plan(1)

  const payload = await deflate(Buffer.from('m1'))
  const url = await startWebSocketServer(t, [
    frame(0x01, true, payload, { compressed: true }),
    textFrame('m2')
  ], { extensions: 'permessage-deflate' })
  const ws = new WebSocket(url)
  t.after(() => ws.close())

  const log = []
  await new Promise((resolve) => {
    ws.addEventListener('message', (event) => {
      log.push(event.data)
      queueMicrotask(() => {
        log.push(`microtask(${event.data})`)
        if (event.data === 'm2') resolve()
      })
    })
  })

  t.assert.deepStrictEqual(log, [
    'm1', 'microtask(m1)',
    'm2', 'microtask(m2)'
  ])
})

test('several messages sharing a chunk with a close frame stay ordered', { timeout: 60000 }, async (t) => {
  t.plan(1)

  const closeFrame = Buffer.from([0x88, 0x02, 0x03, 0xE8])
  const texts = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8']
  const url = await startWebSocketServer(t, [
    ...texts.map((text) => textFrame(text)),
    closeFrame
  ], { end: true })
  const ws = new WebSocket(url)

  const log = []
  ws.addEventListener('message', (event) => {
    log.push(event.data)
    queueMicrotask(() => log.push(`microtask(${event.data})`))
  })

  const [{ code, wasClean }] = await once(ws, 'close')
  await new Promise((resolve) => setImmediate(resolve))

  const expected = []
  for (const text of texts) {
    expected.push(text, `microtask(${text})`)
  }

  t.assert.deepStrictEqual({ code, wasClean, log }, {
    code: 1000,
    wasClean: true,
    log: expected
  })
})

test('messages in the same chunk as a close frame are still delivered before close', { timeout: 60000 }, async (t) => {
  t.plan(1)

  const closeFrame = Buffer.from([0x88, 0x02, 0x03, 0xE8])
  const url = await startWebSocketServer(t, [
    textFrame('m1'),
    textFrame('m2'),
    closeFrame
  ], { end: true })
  const ws = new WebSocket(url)

  const log = []
  ws.addEventListener('message', (event) => {
    log.push(event.data)
    queueMicrotask(() => log.push(`microtask(${event.data})`))
  })

  const closed = once(ws, 'close')
  const [{ code, wasClean }] = await closed

  // Let the message microtasks land before asserting.
  await new Promise((resolve) => setImmediate(resolve))

  t.assert.deepStrictEqual({ code, wasClean, log }, {
    code: 1000,
    wasClean: true,
    log: [
      'm1', 'microtask(m1)',
      'm2', 'microtask(m2)'
    ]
  })
})

// Drive the parser directly so the second chunk is parsed after the microtask
// checkpoint and before the turns armed for the first chunk. A real socket
// delivers that second chunk in a later poll, which hides the reordering.
function createRecordingParser (log) {
  const socket = {
    writableNeedDrain: false,
    write (frame) {
      log.push(frame[0] === 0x88 ? 'close' : 'frame')
      return true
    },
    once () {}
  }
  const handler = {
    readyState: states.OPEN,
    closeState: new Set(),
    socket,
    // WebSocket.#onMessage drops the event once the handshake has left OPEN.
    onMessage (_opcode, data) {
      const text = data.toString()
      if (handler.readyState !== states.OPEN) {
        log.push(`dropped:${text}`)
        return
      }
      log.push(text)
      queueMicrotask(() => log.push(`microtask(${text})`))
    },
    onPing () {},
    onPong () {}
  }
  return new ByteParser(handler)
}

function waitForLog (log, length) {
  return new Promise((resolve) => {
    let turns = 0
    const check = () => {
      if (log.length >= length || ++turns === 8) {
        resolve()
        return
      }
      setImmediate(check)
    }
    setImmediate(check)
  })
}

test('a subsequent message chunk stays behind messages already waiting', async (t) => {
  const log = []
  const parser = createRecordingParser(log)
  t.after(() => parser.destroy())

  parser.write(Buffer.concat([textFrame('m1'), textFrame('m2')]))
  queueMicrotask(() => {
    parser.write(textFrame('m3'))
  })

  await waitForLog(log, 6)

  t.assert.deepStrictEqual(log, [
    'm1', 'microtask(m1)',
    'm2', 'microtask(m2)',
    'm3', 'microtask(m3)'
  ])
})

test('a separate close-only chunk delivers pending messages before close', async (t) => {
  const log = []
  const parser = createRecordingParser(log)
  t.after(() => parser.destroy())

  const closeFrame = Buffer.from([0x88, 0x02, 0x03, 0xE8])
  parser.write(Buffer.concat([textFrame('m1'), textFrame('m2')]))
  queueMicrotask(() => {
    parser.write(closeFrame)
  })

  await waitForLog(log, 5)

  t.assert.deepStrictEqual(log, [
    'm1', 'microtask(m1)',
    'm2', 'microtask(m2)',
    'close'
  ])
})
