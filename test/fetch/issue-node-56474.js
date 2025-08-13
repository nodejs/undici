'use strict'

const { test } = require('node:test')
const { deepStrictEqual } = require('node:assert')
const { Response } = require('../..')

// https://github.com/nodejs/node/issues/56474
test('ReadableStream empty enqueue then other enqueued', async () => {
  const iterable = {
    async * [Symbol.asyncIterator] () {
      yield ''
      yield '3'
      yield '4'
    }
  }

  const response = new Response(iterable)
  deepStrictEqual(await response.text(), '34')
})

test('ReadableStream empty enqueue', async () => {
  const iterable = {
    async * [Symbol.asyncIterator] () {
      yield ''
    }
  }

  const response = new Response(iterable)
  deepStrictEqual(await response.text(), '')
})
