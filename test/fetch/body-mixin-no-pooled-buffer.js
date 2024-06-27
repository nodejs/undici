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
    // Do not use Buffer.allocUnsafe as it exposes the body to the pooled buffer.
    await new Response('...any body').text()
    // Body will be printed included.
    // console.log(new TextDecoder().decode(Buffer.allocUnsafe(1).buffer))
    assert.strictEqual(counter, 0)
  } finally {
    Buffer.allocUnsafe = allocUnsafe
  }
})
