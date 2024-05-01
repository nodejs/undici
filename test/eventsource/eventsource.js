'use strict'

const assert = require('node:assert')
const { test, describe } = require('node:test')
const { EventSource } = require('../../lib/web/eventsource/eventsource')

describe('EventSource - constructor', () => {
  test('Not providing url argument should throw', () => {
    assert.throws(() => new EventSource(), TypeError)
  })
  test('Throw DOMException if URL is invalid', () => {
    assert.throws(() => new EventSource('http:'), { message: /Invalid URL/ })
  })
})
