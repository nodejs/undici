'use strict'

const assert = require('node:assert')
const { test, describe } = require('node:test')
const { EventSourceStream } = require('../../lib/eventsource/eventsource-stream')

describe('EventSourceStream', () => {
  test('ignore empty chunks', () => {
    const stream = new EventSourceStream()

    stream.processEvent = function (event) {
      assert.fail()
    }
    stream.write(Buffer.alloc(0))
  })

  test('Simple event with data field.', () => {
    const content = Buffer.from('data: Hello\n\n', 'utf8')

    const stream = new EventSourceStream()

    stream.processEvent = function (event) {
      assert.strictEqual(typeof event, 'object')
      assert.strictEqual(event.event, undefined)
      assert.strictEqual(event.data, 'Hello')
      assert.strictEqual(event.id, undefined)
      assert.strictEqual(event.retry, undefined)
    }

    for (let i = 0; i < content.length; i++) {
      stream.write(Buffer.from([content[i]]))
    }
  })

  test('Should ignore comments', () => {
    const content = Buffer.from(':data: Hello\n\n', 'utf8')

    const stream = new EventSourceStream()

    stream.processEvent = function (event) {
      assert.strictEqual(typeof event, 'object')
      assert.strictEqual(event.event, undefined)
      assert.strictEqual(event.data, undefined)
      assert.strictEqual(event.id, undefined)
      assert.strictEqual(event.retry, undefined)
    }

    for (let i = 0; i < content.length; i++) {
      stream.write(Buffer.from([content[i]]))
    }
  })

  test('Should fire two events.', () => {
    // @see https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation
    const content = Buffer.from('data\n\ndata\ndata\n\ndata:', 'utf8')
    const stream = new EventSourceStream()

    stream.processEvent = function (event) {
      assert.strictEqual(typeof event, 'object')
      assert.strictEqual(event.event, undefined)
      assert.strictEqual(event.data, undefined)
      assert.strictEqual(event.id, undefined)
      assert.strictEqual(event.retry, undefined)
    }

    for (let i = 0; i < content.length; i++) {
      stream.write(Buffer.from([content[i]]))
    }
  })

  test('Should fire two identical events.', () => {
    // @see https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation
    const content = Buffer.from('data:test\n\ndata: test\n\n', 'utf8')
    const stream = new EventSourceStream()

    stream.processEvent = function (event) {
      assert.strictEqual(typeof event, 'object')
      assert.strictEqual(event.event, undefined)
      assert.strictEqual(event.data, 'test')
      assert.strictEqual(event.id, undefined)
      assert.strictEqual(event.retry, undefined)
    }

    for (let i = 0; i < content.length; i++) {
      stream.write(Buffer.from([content[i]]))
    }
  })
})
