'use strict'

const { test } = require('node:test')
const { Response } = require('../..')

// https://github.com/nodejs/undici/issues/6092
// Jest fake timers replace queueMicrotask, so the deferred close from pull()
// can run after another pull. A byte-sequence body must still be delivered once.

async function readWithDelayedClose (body) {
  const original = globalThis.queueMicrotask
  globalThis.queueMicrotask = (callback) => {
    setImmediate(callback)
  }

  try {
    const reader = new Response(body).body.getReader()
    const chunks = []

    // More than one read: the bug enqueues the whole body on every pull.
    for (let i = 0; i < 5; i++) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      chunks.push(value)
    }

    return chunks
  } finally {
    globalThis.queueMicrotask = original
  }
}

function assertSingleChunk (t, chunks, expected) {
  t.assert.strictEqual(chunks.length, 1)
  t.assert.deepStrictEqual(Buffer.from(chunks[0]), Buffer.from(expected))
}

test('string body is delivered once when queueMicrotask is delayed', async (t) => {
  const chunks = await readWithDelayedClose('hello')
  assertSingleChunk(t, chunks, 'hello')
})

test('Uint8Array body is delivered once when queueMicrotask is delayed', async (t) => {
  const chunks = await readWithDelayedClose(new Uint8Array(Buffer.from('world')))
  assertSingleChunk(t, chunks, 'world')
})
