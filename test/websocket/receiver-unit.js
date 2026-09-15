'use strict'

const { test } = require('node:test')
const { createDeflateRaw, constants } = require('node:zlib')
const { ByteParser } = require('../../lib/web/websocket/receiver')
const { states } = require('../../lib/web/websocket/constants')

const invalidFrame = Buffer.from([0x82, 0x7F, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01])

test('ByteParser rejects 64-bit payload lengths with a non-zero upper word', (t) => {
  const calls = {
    abort: 0,
    close: 0
  }

  const handler = {
    readyState: states.CONNECTING,
    controller: {
      abort: () => {
        calls.abort += 1
      }
    },
    onSocketClose: () => {
      calls.close += 1
    },
    closeState: new Set()
  }

  const parser = new ByteParser(handler)

  parser.write(invalidFrame)

  return new Promise((resolve) => {
    setImmediate(() => {
      t.assert.strictEqual(calls.abort, 1)
      t.assert.strictEqual(calls.close, 1)
      parser.destroy()
      resolve()
    })
  })
})

/**
 * Compresses `data` the way a permessage-deflate peer does: deflate raw, sync
 * flush, and strip the trailing 0x00 0x00 0xff 0xff octets.
 * @param {Buffer} data
 * @returns {Promise<Buffer>}
 */
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

/**
 * A handler that records what the parser delivered to the application.
 */
function createRecordingHandler () {
  const events = []

  return {
    events,
    readyState: states.OPEN,
    socket: {
      destroyed: false,
      destroy () {
        this.destroyed = true
      },
      write () {}
    },
    controller: {
      abort () {
        events.push('abort')
      }
    },
    closeState: new Set(),
    onMessage (type, data) {
      events.push(`message:${data.length}`)
    },
    onPing () {},
    onPong () {},
    onSocketClose () {
      events.push('close')
    },
    onParserError () {},
    onParserDrain () {}
  }
}

function tick () {
  return new Promise((resolve) => setTimeout(resolve, 50))
}

test('ByteParser fails the connection on a continuation frame after a compressed message', async (t) => {
  const handler = createRecordingHandler()
  const parser = new ByteParser(handler, new Map([['permessage-deflate', 'permessage-deflate']]), {})

  t.after(() => parser.destroy())

  const payload = await deflate(Buffer.from('hello'))

  // A complete compressed text message: FIN, RSV1, opcode 0x1.
  parser.write(Buffer.concat([Buffer.from([0xC1, payload.length]), payload]))
  await tick()

  // No fragmented message is in progress, so this continuation frame must fail
  // the connection rather than start a new message.
  parser.write(Buffer.from([0x80, 0x00]))
  await tick()

  t.assert.deepStrictEqual(handler.events, ['message:5', 'abort'])
})

test('ByteParser fails the connection on a continuation frame after an uncompressed message (control)', async (t) => {
  const handler = createRecordingHandler()
  const parser = new ByteParser(handler, null, {})

  t.after(() => parser.destroy())

  // A complete text message "hello": FIN, opcode 0x1.
  parser.write(Buffer.concat([Buffer.from([0x81, 0x05]), Buffer.from('hello')]))
  await tick()

  parser.write(Buffer.from([0x80, 0x00]))
  await tick()

  t.assert.deepStrictEqual(handler.events, ['message:5', 'abort'])
})

test('ByteParser still assembles a fragmented compressed message (control)', async (t) => {
  const handler = createRecordingHandler()
  const parser = new ByteParser(handler, new Map([['permessage-deflate', 'permessage-deflate']]), {})

  t.after(() => parser.destroy())

  const payload = await deflate(Buffer.from('hello'))
  const head = payload.subarray(0, 2)
  const tail = payload.subarray(2)

  // Compressed text frame, not final: RSV1, opcode 0x1.
  parser.write(Buffer.concat([Buffer.from([0x41, head.length]), head]))
  await tick()

  // Final continuation frame: the message is in progress, so this is legal.
  parser.write(Buffer.concat([Buffer.from([0x80, tail.length]), tail]))
  await tick()

  t.assert.deepStrictEqual(handler.events, ['message:5'])
})
