'use strict'

const assert = require('node:assert')
const { test, describe } = require('node:test')
const { EventSourceStream } = require('../../lib/web/eventsource/eventsource-stream')

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

  test('Should also process CR as EOL.', () => {
    const content = Buffer.from('data: Hello\r\r', 'utf8')

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

  test('Should also process CRLF as EOL.', () => {
    const content = Buffer.from('data: Hello\r\n\r\n', 'utf8')

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

  test('Should also process mixed CR and CRLF as EOL.', () => {
    const content = Buffer.from('data: Hello\r\r\n', 'utf8')

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

  test('Should also process mixed LF and CRLF as EOL.', () => {
    const content = Buffer.from('data: Hello\n\r\n', 'utf8')

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

    let count = 0
    stream.processEvent = function (event) {
      switch (count) {
        case 0: {
          assert.strictEqual(typeof event, 'object')
          assert.strictEqual(event.event, undefined)
          assert.strictEqual(event.data, '')
          assert.strictEqual(event.id, undefined)
          assert.strictEqual(event.retry, undefined)
          break
        }
        case 1: {
          assert.strictEqual(typeof event, 'object')
          assert.strictEqual(event.event, undefined)
          assert.strictEqual(event.data, '\n')
          assert.strictEqual(event.id, undefined)
          assert.strictEqual(event.retry, undefined)
        }
      }
      count++
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

  test('ignores empty comments', () => {
    const content = Buffer.from('data: Hello\n\n:\n\ndata: World\n\n', 'utf8')
    const stream = new EventSourceStream()

    let count = 0

    stream.processEvent = function (event) {
      switch (count) {
        case 0: {
          assert.strictEqual(typeof event, 'object')
          assert.strictEqual(event.event, undefined)
          assert.strictEqual(event.data, 'Hello')
          assert.strictEqual(event.id, undefined)
          assert.strictEqual(event.retry, undefined)
          break
        }
        case 1: {
          assert.strictEqual(typeof event, 'object')
          assert.strictEqual(event.event, undefined)
          assert.strictEqual(event.data, 'World')
          assert.strictEqual(event.id, undefined)
          assert.strictEqual(event.retry, undefined)
          break
        }
        default: {
          assert.fail()
        }
      }
      count++
    }

    stream.write(content)
  })

  test('comment fest', () => {
    const longstring = new Array(2 * 1024 + 1).join('x')
    const content = Buffer.from(`data:1\r:\0\n:\r\ndata:2\n:${longstring}\rdata:3\n:data:fail\r:${longstring}\ndata:4\n\n`, 'utf8')
    const stream = new EventSourceStream()

    stream.processEvent = function (event) {
      assert.strictEqual(typeof event, 'object')
      assert.strictEqual(event.event, undefined)
      assert.strictEqual(event.data, '1\n2\n3\n4')
      assert.strictEqual(event.id, undefined)
      assert.strictEqual(event.retry, undefined)
    }

    stream.write(content)
  })

  test('comment fest', () => {
    const content = Buffer.from('data:\n\ndata\ndata\n\ndata:test\n\n', 'utf8')
    const stream = new EventSourceStream()

    let count = 0
    stream.processEvent = function (event) {
      assert.strictEqual(typeof event, 'object')
      assert.strictEqual(event.event, undefined)
      assert.strictEqual(event.id, undefined)
      assert.strictEqual(event.retry, undefined)
      switch (count) {
        case 0: {
          assert.strictEqual(event.data, '')
          break
        }
        case 1: {
          assert.strictEqual(event.data, '\n')
          break
        }
        case 2: {
          assert.strictEqual(event.data, 'test')
          break
        }
        default: {
          assert.fail()
        }
      }
      count++
    }
    stream.write(content)
  })

  test('newline test', () => {
    const content = Buffer.from('data:test\r\ndata\ndata:test\r\n\r\n', 'utf8')
    const stream = new EventSourceStream()

    stream.processEvent = function (event) {
      assert.strictEqual(typeof event, 'object')
      assert.strictEqual(event.event, undefined)
      assert.strictEqual(event.id, undefined)
      assert.strictEqual(event.retry, undefined)
      assert.strictEqual(event.data, 'test\n\ntest')
    }
    stream.write(content)
  })

  test('newline test', () => {
    const content = Buffer.from('data:test\n data\ndata\nfoobar:xxx\njustsometext\n:thisisacommentyay\ndata:test\n\n', 'utf8')
    const stream = new EventSourceStream()

    stream.processEvent = function (event) {
      assert.strictEqual(typeof event, 'object')
      assert.strictEqual(event.event, undefined)
      assert.strictEqual(event.id, undefined)
      assert.strictEqual(event.retry, undefined)
      assert.strictEqual(event.data, 'test\n\ntest')
    }
    stream.write(content)
  })

  test('newline test', () => {
    const content = Buffer.from('data:test\n data\ndata\nfoobar:xxx\njustsometext\n:thisisacommentyay\ndata:test\n\n', 'utf8')
    const stream = new EventSourceStream()

    stream.processEvent = function (event) {
      assert.strictEqual(typeof event, 'object')
      assert.strictEqual(event.event, undefined)
      assert.strictEqual(event.id, undefined)
      assert.strictEqual(event.retry, undefined)
      assert.strictEqual(event.data, 'test\n\ntest')
    }
    stream.write(content)
  })
})
