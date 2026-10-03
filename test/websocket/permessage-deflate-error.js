'use strict'

const { test } = require('node:test')
const { setImmediate, setTimeout: sleep } = require('node:timers/promises')
const { createDeflateRaw, constants } = require('node:zlib')
const { ByteParser } = require('../../lib/web/websocket/receiver')
const { PerMessageDeflate } = require('../../lib/web/websocket/permessage-deflate')
const { states } = require('../../lib/web/websocket/constants')

const timeout = Symbol('timeout')

function deflate (data) {
  return new Promise((resolve, reject) => {
    const stream = createDeflateRaw()
    const chunks = []

    stream.on('data', (chunk) => chunks.push(chunk))
    stream.on('error', reject)
    stream.write(data)
    stream.flush(constants.Z_SYNC_FLUSH, () => {
      const output = Buffer.concat(chunks)
      stream.destroy()
      resolve(output.subarray(0, output.length - 4))
    })
  })
}

function frame (payload) {
  return Buffer.concat([Buffer.from([0xc1, payload.length]), payload])
}

test('a zlib error is reported to the active decompression callback', async (t) => {
  const perMessageDeflate = new PerMessageDeflate(
    new Map([['permessage-deflate', 'permessage-deflate']]),
    { maxPayloadSize: 0 }
  )
  const valid = await deflate(Buffer.from('hello'))

  let firstCalls = 0
  await new Promise((resolve, reject) => {
    perMessageDeflate.decompress(valid, true, (error, data) => {
      firstCalls++

      if (error) {
        reject(error)
        return
      }

      t.assert.strictEqual(data.toString(), 'hello')
      resolve()
    })
  })

  let secondCalls = 0
  const result = await Promise.race([
    new Promise((resolve) => {
      perMessageDeflate.decompress(Buffer.from([0xff, 0xfe, 0xfd, 0xfc, 0xfb]), true, (error) => {
        secondCalls++
        resolve(error)
      })
    }),
    sleep(500, timeout)
  ])

  t.assert.notStrictEqual(result, timeout)
  t.assert.ok(result instanceof Error)

  await setImmediate()

  t.assert.strictEqual(firstCalls, 1)
  t.assert.strictEqual(secondCalls, 1)
})

test('a payload limit error is reported to the active decompression callback', async (t) => {
  const perMessageDeflate = new PerMessageDeflate(
    new Map([['permessage-deflate', 'permessage-deflate']]),
    { maxPayloadSize: 5 }
  )
  const valid = await deflate(Buffer.from('hi'))
  const oversized = await deflate(Buffer.from('abcdefghij'))

  let firstCalls = 0
  await new Promise((resolve, reject) => {
    perMessageDeflate.decompress(valid, true, (error) => {
      firstCalls++
      error ? reject(error) : resolve()
    })
  })

  let secondCalls = 0
  const result = await Promise.race([
    new Promise((resolve) => {
      perMessageDeflate.decompress(oversized, true, (error) => {
        secondCalls++
        resolve(error)
      })
    }),
    sleep(500, timeout)
  ])

  t.assert.notStrictEqual(result, timeout)
  t.assert.strictEqual(result?.name, 'MessageSizeExceededError')

  await setImmediate()

  t.assert.strictEqual(firstCalls, 1)
  t.assert.strictEqual(secondCalls, 1)
})

test('a decompression error settles and destroys the active parser write', async (t) => {
  const messages = []
  const socket = {
    destroyed: false,
    write () {},
    destroy () {
      this.destroyed = true
    }
  }
  const handler = {
    readyState: states.OPEN,
    socket,
    closeState: new Set(),
    controller: { abort () {} },
    onMessage (opcode, data) {
      messages.push(data.toString())
    }
  }
  const parser = new ByteParser(
    handler,
    new Map([['permessage-deflate', 'permessage-deflate']])
  )
  const valid = await deflate(Buffer.from('hello'))

  await new Promise((resolve, reject) => {
    parser.write(frame(valid), (error) => error ? reject(error) : resolve())
  })

  const result = await Promise.race([
    new Promise((resolve) => {
      parser.write(frame(Buffer.from([0xff, 0xfe, 0xfd, 0xfc, 0xfb])), resolve)
    }),
    sleep(500, timeout)
  ])

  t.assert.notStrictEqual(result, timeout)

  await setImmediate()

  t.assert.deepStrictEqual(messages, ['hello'])
  t.assert.strictEqual(parser.destroyed, true)
  t.assert.strictEqual(parser.writableLength, 0)
  t.assert.strictEqual(parser._writableState.writing, false)
  t.assert.strictEqual(parser._writableState.pendingcb, 0)
})
