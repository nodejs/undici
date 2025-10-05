'use strict'

const { test } = require('node:test')
const { EventSource } = require('../..') // assuming the test is in test/eventsource/

test('EventSource.prototype properties are configured correctly', (t) => {
  const props = Object.entries(Object.getOwnPropertyDescriptors(EventSource.prototype))

  for (const [key, value] of props) {
    if (key !== 'constructor') {
      t.assert.ok(value.enumerable, `${key} is not enumerable`)
    }
  }
})
