'use strict'

const { deepStrictEqual } = require('node:assert')
const { sep } = require('node:path')
const { test } = require('node:test')
const countPromises = require('count-promises')
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

const expectedPromiseCount = 13

test(`Should create ${expectedPromiseCount} promises for simple iterator`, async () => {
  const getPromiseCount = countPromises({ locations: true, continuation: false })
  const iterable = {
    async * [Symbol.asyncIterator] () {
      yield ''
      yield '3'
      yield '4'
    }
  }

  const response = new Response(iterable)
  await response.text()

  const promiseCount = Object.fromEntries(Object.entries(getPromiseCount()).filter(([path]) => path.includes('undici') && !path.includes('node:internal') && !path.includes(`undici${sep}test`)))

  const actualPromiseCount = Object.entries(promiseCount).reduce((acc, [key, value]) => acc + value, 0)
  deepStrictEqual(actualPromiseCount, expectedPromiseCount, `Expected ${expectedPromiseCount} promises to be created, got ${actualPromiseCount}`)
})
