'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { EventSource } = require('../..') // assuming the test is in test/eventsource/

test('EventSource.prototype properties are configured correctly', () => {
  const props = Object.entries(Object.getOwnPropertyDescriptors(EventSource.prototype))

  for (const [key, value] of props) {
    if (key !== 'constructor') {
      assert(value.enumerable, `${key} is not enumerable`)
    }
  }
})
