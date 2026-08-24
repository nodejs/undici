'use strict'

const { test } = require('node:test')
const { Response } = require('../..')

// https://github.com/nodejs/node/issues/56474
test('ReadableStream empty enqueue then other enqueued', async (t) => {
  const iterable = {
    async * [Symbol.asyncIterator] () {
      yield ''
      yield '3'
      yield '4'
    }
  }

  const response = new Response(iterable)
  t.assert.deepStrictEqual(await response.text(), '34')
})

test('ReadableStream empty enqueue', async (t) => {
  const iterable = {
    async * [Symbol.asyncIterator] () {
      yield ''
    }
  }

  const response = new Response(iterable)
  t.assert.deepStrictEqual(await response.text(), '')
})

// https://github.com/nodejs/undici/issues/5715
test('ReadableStream cancellation while iterator.next() is in flight', async (t) => {
  let resolveNext
  let startNext
  const nextStarted = new Promise((resolve) => {
    startNext = resolve
  })
  const iterable = {
    [Symbol.asyncIterator] () {
      return {
        next () {
          startNext()
          return new Promise((resolve) => {
            resolveNext = resolve
          })
        },
        return () {
          return Promise.resolve({ done: true, value: undefined })
        }
      }
    }
  }

  const reader = new Response(iterable).body.getReader()
  const read = reader.read()
  await nextStarted
  await reader.cancel()
  resolveNext({ done: true, value: undefined })
  t.assert.deepStrictEqual(await read, { done: true, value: undefined })

  // Let the microtask that closes the controller run. It must not throw if
  // cancellation already closed the stream.
  await new Promise((resolve) => setImmediate(resolve))
})
