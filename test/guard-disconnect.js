'use strict'

const { describe, test } = require('node:test')
const { EventEmitter } = require('node:events')
const { strictEqual } = require('node:assert')

function guardDisconnect (dispatcher, t) {
  dispatcher.on('disconnect', () => {
    if (!dispatcher.closed && !dispatcher.destroyed) {
      t.fail('unexpected disconnect')
    }
  })
}

describe('guardDisconnect', () => {
  const cases = [
    { closed: false, destroyed: false, shouldFail: true, label: 'active dispatcher' },
    { closed: true, destroyed: false, shouldFail: false, label: 'closed dispatcher' },
    { closed: false, destroyed: true, shouldFail: false, label: 'destroyed dispatcher' },
    { closed: true, destroyed: true, shouldFail: false, label: 'closed and destroyed dispatcher' }
  ]

  for (const { closed, destroyed, shouldFail, label } of cases) {
    test(`${shouldFail ? 'calls' : 'does not call'} t.fail for ${label}`, () => {
      const dispatcher = new EventEmitter()
      dispatcher.closed = closed
      dispatcher.destroyed = destroyed

      let failReason = null
      const t = { fail: (reason) => { failReason = reason } }

      guardDisconnect(dispatcher, t)
      dispatcher.emit('disconnect')

      strictEqual(failReason, shouldFail ? 'unexpected disconnect' : null)
    })
  }
})

module.exports = { guardDisconnect }
