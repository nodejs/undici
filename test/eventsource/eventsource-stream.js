'use strict'

const { test, describe } = require('node:test')
const { EventSourceStream } = require('../../lib/web/eventsource/eventsource-stream')

describe('EventSourceStream', () => {
  test('ignore empty chunks', (t) => {
    const stream = new EventSourceStream()

    stream.processEvent = function (event) {
      t.assert.fail()
    }
    stream.write(Buffer.alloc(0))
  })

  test('Simple event with data field.', (t) => {
    const content = Buffer.from('data: Hello\n\n', 'utf8')

    const stream = new EventSourceStream()

    stream.processEvent = function (event) {
      t.assert.strictEqual(typeof event, 'object')
      t.assert.strictEqual(event.event, undefined)
      t.assert.strictEqual(event.data, 'Hello')
      t.assert.strictEqual(event.id, undefined)
      t.assert.strictEqual(event.retry, undefined)
    }

    for (let i = 0; i < content.length; i++) {
      stream.write(Buffer.from([content[i]]))
    }
  })

  test('Should also process CR as EOL.', (t) => {
    const content = Buffer.from('data: Hello\r\r', 'utf8')

    const stream = new EventSourceStream()

    stream.processEvent = function (event) {
      t.assert.strictEqual(typeof event, 'object')
      t.assert.strictEqual(event.event, undefined)
      t.assert.strictEqual(event.data, 'Hello')
      t.assert.strictEqual(event.id, undefined)
      t.assert.strictEqual(event.retry, undefined)
    }

    for (let i = 0; i < content.length; i++) {
      stream.write(Buffer.from([content[i]]))
    }
  })

  test('Should also process CRLF as EOL.', (t) => {
    const content = Buffer.from('data: Hello\r\n\r\n', 'utf8')

    const stream = new EventSourceStream()

    stream.processEvent = function (event) {
      t.assert.strictEqual(typeof event, 'object')
      t.assert.strictEqual(event.event, undefined)
      t.assert.strictEqual(event.data, 'Hello')
      t.assert.strictEqual(event.id, undefined)
      t.assert.strictEqual(event.retry, undefined)
    }

    for (let i = 0; i < content.length; i++) {
      stream.write(Buffer.from([content[i]]))
    }
  })

  test('Should also process mixed CR and CRLF as EOL.', (t) => {
    const content = Buffer.from('data: Hello\r\r\n', 'utf8')

    const stream = new EventSourceStream()

    stream.processEvent = function (event) {
      t.assert.strictEqual(typeof event, 'object')
      t.assert.strictEqual(event.event, undefined)
      t.assert.strictEqual(event.data, 'Hello')
      t.assert.strictEqual(event.id, undefined)
      t.assert.strictEqual(event.retry, undefined)
    }

    for (let i = 0; i < content.length; i++) {
      stream.write(Buffer.from([content[i]]))
    }
  })

  test('Should also process mixed LF and CRLF as EOL.', (t) => {
    const content = Buffer.from('data: Hello\n\r\n', 'utf8')

    const stream = new EventSourceStream()

    stream.processEvent = function (event) {
      t.assert.strictEqual(typeof event, 'object')
      t.assert.strictEqual(event.event, undefined)
      t.assert.strictEqual(event.data, 'Hello')
      t.assert.strictEqual(event.id, undefined)
      t.assert.strictEqual(event.retry, undefined)
    }

    for (let i = 0; i < content.length; i++) {
      stream.write(Buffer.from([content[i]]))
    }
  })

  test('Should ignore comments', (t) => {
    const content = Buffer.from(':data: Hello\n\n', 'utf8')

    const stream = new EventSourceStream()

    stream.processEvent = function (event) {
      t.assert.strictEqual(typeof event, 'object')
      t.assert.strictEqual(event.event, undefined)
      t.assert.strictEqual(event.data, undefined)
      t.assert.strictEqual(event.id, undefined)
      t.assert.strictEqual(event.retry, undefined)
    }

    for (let i = 0; i < content.length; i++) {
      stream.write(Buffer.from([content[i]]))
    }
  })

  test('Should fire two events.', (t) => {
    // @see https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation
    const content = Buffer.from('data\n\ndata\ndata\n\ndata:', 'utf8')
    const stream = new EventSourceStream()

    let count = 0
    stream.processEvent = function (event) {
      switch (count) {
        case 0: {
          t.assert.strictEqual(typeof event, 'object')
          t.assert.strictEqual(event.event, undefined)
          t.assert.strictEqual(event.data, '')
          t.assert.strictEqual(event.id, undefined)
          t.assert.strictEqual(event.retry, undefined)
          break
        }
        case 1: {
          t.assert.strictEqual(typeof event, 'object')
          t.assert.strictEqual(event.event, undefined)
          t.assert.strictEqual(event.data, '\n')
          t.assert.strictEqual(event.id, undefined)
          t.assert.strictEqual(event.retry, undefined)
        }
      }
      count++
    }

    for (let i = 0; i < content.length; i++) {
      stream.write(Buffer.from([content[i]]))
    }
  })

  test('Should fire two identical events.', (t) => {
    // @see https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation
    const content = Buffer.from('data:test\n\ndata: test\n\n', 'utf8')
    const stream = new EventSourceStream()

    stream.processEvent = function (event) {
      t.assert.strictEqual(typeof event, 'object')
      t.assert.strictEqual(event.event, undefined)
      t.assert.strictEqual(event.data, 'test')
      t.assert.strictEqual(event.id, undefined)
      t.assert.strictEqual(event.retry, undefined)
    }

    for (let i = 0; i < content.length; i++) {
      stream.write(Buffer.from([content[i]]))
    }
  })

  test('ignores empty comments', (t) => {
    const content = Buffer.from('data: Hello\n\n:\n\ndata: World\n\n', 'utf8')
    const stream = new EventSourceStream()

    let count = 0

    stream.processEvent = function (event) {
      switch (count) {
        case 0: {
          t.assert.strictEqual(typeof event, 'object')
          t.assert.strictEqual(event.event, undefined)
          t.assert.strictEqual(event.data, 'Hello')
          t.assert.strictEqual(event.id, undefined)
          t.assert.strictEqual(event.retry, undefined)
          break
        }
        case 1: {
          t.assert.strictEqual(typeof event, 'object')
          t.assert.strictEqual(event.event, undefined)
          t.assert.strictEqual(event.data, 'World')
          t.assert.strictEqual(event.id, undefined)
          t.assert.strictEqual(event.retry, undefined)
          break
        }
        default: {
          t.assert.fail()
        }
      }
      count++
    }

    stream.write(content)
  })

  test('comment fest', (t) => {
    const longstring = new Array(2 * 1024 + 1).join('x')
    const content = Buffer.from(`data:1\r:\0\n:\r\ndata:2\n:${longstring}\rdata:3\n:data:fail\r:${longstring}\ndata:4\n\n`, 'utf8')
    const stream = new EventSourceStream()

    stream.processEvent = function (event) {
      t.assert.strictEqual(typeof event, 'object')
      t.assert.strictEqual(event.event, undefined)
      t.assert.strictEqual(event.data, '1\n2\n3\n4')
      t.assert.strictEqual(event.id, undefined)
      t.assert.strictEqual(event.retry, undefined)
    }

    stream.write(content)
  })

  test('comment fest', (t) => {
    const content = Buffer.from('data:\n\ndata\ndata\n\ndata:test\n\n', 'utf8')
    const stream = new EventSourceStream()

    let count = 0
    stream.processEvent = function (event) {
      t.assert.strictEqual(typeof event, 'object')
      t.assert.strictEqual(event.event, undefined)
      t.assert.strictEqual(event.id, undefined)
      t.assert.strictEqual(event.retry, undefined)
      switch (count) {
        case 0: {
          t.assert.strictEqual(event.data, '')
          break
        }
        case 1: {
          t.assert.strictEqual(event.data, '\n')
          break
        }
        case 2: {
          t.assert.strictEqual(event.data, 'test')
          break
        }
        default: {
          t.assert.fail()
        }
      }
      count++
    }
    stream.write(content)
  })

  test('newline test', (t) => {
    const content = Buffer.from('data:test\r\ndata\ndata:test\r\n\r\n', 'utf8')
    const stream = new EventSourceStream()

    stream.processEvent = function (event) {
      t.assert.strictEqual(typeof event, 'object')
      t.assert.strictEqual(event.event, undefined)
      t.assert.strictEqual(event.id, undefined)
      t.assert.strictEqual(event.retry, undefined)
      t.assert.strictEqual(event.data, 'test\n\ntest')
    }
    stream.write(content)
  })

  test('newline test', (t) => {
    const content = Buffer.from('data:test\n data\ndata\nfoobar:xxx\njustsometext\n:thisisacommentyay\ndata:test\n\n', 'utf8')
    const stream = new EventSourceStream()

    stream.processEvent = function (event) {
      t.assert.strictEqual(typeof event, 'object')
      t.assert.strictEqual(event.event, undefined)
      t.assert.strictEqual(event.id, undefined)
      t.assert.strictEqual(event.retry, undefined)
      t.assert.strictEqual(event.data, 'test\n\ntest')
    }
    stream.write(content)
  })

  test('newline test', (t) => {
    const content = Buffer.from('data:test\n data\ndata\nfoobar:xxx\njustsometext\n:thisisacommentyay\ndata:test\n\n', 'utf8')
    const stream = new EventSourceStream()

    stream.processEvent = function (event) {
      t.assert.strictEqual(typeof event, 'object')
      t.assert.strictEqual(event.event, undefined)
      t.assert.strictEqual(event.id, undefined)
      t.assert.strictEqual(event.retry, undefined)
      t.assert.strictEqual(event.data, 'test\n\ntest')
    }
    stream.write(content)
  })
})
