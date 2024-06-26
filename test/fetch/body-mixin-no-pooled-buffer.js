'use strict'

const { Response } = require('../../')
const assert = require('node:assert')
const { test } = require('node:test')

test('Do not use pooled buffer in body mixin', async () => {
  const allocUnsafe = Buffer.allocUnsafe

  try {
    let counter = 0
    Buffer.allocUnsafe = function (...args) {
      counter++
      return allocUnsafe(...args)
    }
    await new Response(new Uint8Array(1)).text()
    assert.strictEqual(counter, 0)
  } finally {
    Buffer.allocUnsafe = allocUnsafe
  }
})
