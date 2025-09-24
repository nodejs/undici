'use strict'

const { test } = require('node:test')
const { Writable } = require('node:stream')
const { MockAgent, stream } = require('..')

test('stream() does not fail after request has been aborted', async (t) => {
  const mockAgent = new MockAgent()

  mockAgent.disableNetConnect()
  mockAgent
    .get('http://localhost:3333')
    .intercept({
      path: '/'
    })
    .reply(200, 'ok')
    .delay(10)

  const parts = []
  const ac = new AbortController()

  setTimeout(() => ac.abort(), 5)

  await t.assert.rejects(
    stream(
      'http://localhost:3333/',
      {
        opaque: { parts },
        signal: ac.signal,
        dispatcher: mockAgent
      },
      ({ opaque: { parts } }) => {
        return new Writable({
          write (chunk, _encoding, callback) {
            parts.push(chunk)
            callback()
          }
        })
      }
    ),
    new DOMException('This operation was aborted', 'AbortError')
  )
})
