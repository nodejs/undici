'use strict'

const { test } = require('node:test')
const { Request, Response } = require('../..')

const sharedViews = [
  ['Uint8Array', () => new Uint8Array(new SharedArrayBuffer(4))],
  ['Buffer', () => Buffer.from(new SharedArrayBuffer(4))],
  ['DataView', () => new DataView(new SharedArrayBuffer(4))]
]

for (const [name, createView] of sharedViews) {
  test(`Request rejects a ${name} backed by a SharedArrayBuffer`, (t) => {
    t.assert.throws(
      () => new Request('http://localhost', {
        method: 'POST',
        body: createView()
      }),
      TypeError
    )
  })

  test(`Response rejects a ${name} backed by a SharedArrayBuffer`, (t) => {
    t.assert.throws(
      () => new Response(createView()),
      TypeError
    )
  })
}

test('ArrayBuffer-backed views remain valid bodies', async (t) => {
  const bytes = Uint8Array.from([255, 216, 255, 219])
  const request = new Request('http://localhost', {
    method: 'POST',
    body: bytes
  })
  const response = new Response(bytes)

  t.assert.deepStrictEqual(
    Buffer.from(await request.arrayBuffer()),
    Buffer.from(bytes)
  )
  t.assert.deepStrictEqual(
    Buffer.from(await response.arrayBuffer()),
    Buffer.from(bytes)
  )
})
