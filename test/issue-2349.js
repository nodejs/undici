'use strict'

const { test } = require('tap')
const { Writable } = require('stream')
const { MockAgent, errors, stream } = require('..')

test('stream() does not fail after request has been aborted', async (t) => {
  t.plan(1)

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

  setTimeout(() => ac.abort('nevermind'), 5)

  try {
    await stream(
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
    )
  } catch (error) {
    console.log(error)
    t.equal(error instanceof errors.RequestAbortedError, true)
  }
})
