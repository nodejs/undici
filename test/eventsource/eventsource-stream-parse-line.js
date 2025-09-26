'use strict'

const { test, describe } = require('node:test')
const { EventSourceStream } = require('../../lib/web/eventsource/eventsource-stream')

describe('EventSourceStream - parseLine', () => {
  const defaultEventSourceSettings = {
    origin: 'example.com',
    reconnectionTime: 1000
  }

  test('Should push an unmodified event when line is empty', (t) => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    const event = {}

    stream.parseLine(Buffer.from('', 'utf8'), event)

    t.assert.strictEqual(typeof event, 'object')
    t.assert.strictEqual(Object.keys(event).length, 0)
    t.assert.strictEqual(event.data, undefined)
    t.assert.strictEqual(event.id, undefined)
    t.assert.strictEqual(event.event, undefined)
    t.assert.strictEqual(event.retry, undefined)
  })

  test('Should set the data field with empty string if not containing data', (t) => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    const event = {}

    stream.parseLine(Buffer.from('data:', 'utf8'), event)

    t.assert.strictEqual(typeof event, 'object')
    t.assert.strictEqual(Object.keys(event).length, 1)
    t.assert.strictEqual(event.data, '')
    t.assert.strictEqual(event.id, undefined)
    t.assert.strictEqual(event.event, undefined)
    t.assert.strictEqual(event.retry, undefined)
  })

  test('Should set the data field with empty string if not containing data (containing space after colon)', (t) => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    const event = {}

    stream.parseLine(Buffer.from('data: ', 'utf8'), event)

    t.assert.strictEqual(typeof event, 'object')
    t.assert.strictEqual(Object.keys(event).length, 1)
    t.assert.strictEqual(event.data, '')
    t.assert.strictEqual(event.id, undefined)
    t.assert.strictEqual(event.event, undefined)
    t.assert.strictEqual(event.retry, undefined)
  })

  test('Should set the data field with a string containing space if having more than one space after colon', (t) => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    const event = {}

    stream.parseLine(Buffer.from('data:   ', 'utf8'), event)

    t.assert.strictEqual(typeof event, 'object')
    t.assert.strictEqual(Object.keys(event).length, 1)
    t.assert.strictEqual(event.data, '  ')
    t.assert.strictEqual(event.id, undefined)
    t.assert.strictEqual(event.event, undefined)
    t.assert.strictEqual(event.retry, undefined)
  })

  test('Should set value properly, even if the line contains multiple colons', (t) => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    const event = {}

    stream.parseLine(Buffer.from('data: : ', 'utf8'), event)

    t.assert.strictEqual(typeof event, 'object')
    t.assert.strictEqual(Object.keys(event).length, 1)
    t.assert.strictEqual(event.data, ': ')
    t.assert.strictEqual(event.id, undefined)
    t.assert.strictEqual(event.event, undefined)
    t.assert.strictEqual(event.retry, undefined)
  })

  test('Should set the data field when containing data', (t) => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    const event = {}

    stream.parseLine(Buffer.from('data: Hello', 'utf8'), event)

    t.assert.strictEqual(typeof event, 'object')
    t.assert.strictEqual(Object.keys(event).length, 1)
    t.assert.strictEqual(event.data, 'Hello')
    t.assert.strictEqual(event.id, undefined)
    t.assert.strictEqual(event.event, undefined)
    t.assert.strictEqual(event.retry, undefined)
  })

  test('Should ignore comments', (t) => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    const event = {}

    stream.parseLine(Buffer.from(':comment', 'utf8'), event)

    t.assert.strictEqual(typeof event, 'object')
    t.assert.strictEqual(Object.keys(event).length, 0)
    t.assert.strictEqual(event.data, undefined)
    t.assert.strictEqual(event.id, undefined)
    t.assert.strictEqual(event.event, undefined)
    t.assert.strictEqual(event.retry, undefined)
  })

  test('Should set retry field', (t) => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    const event = {}

    stream.parseLine(Buffer.from('retry: 1000', 'utf8'), event)

    t.assert.strictEqual(typeof event, 'object')
    t.assert.strictEqual(Object.keys(event).length, 1)
    t.assert.strictEqual(event.data, undefined)
    t.assert.strictEqual(event.id, undefined)
    t.assert.strictEqual(event.event, undefined)
    t.assert.strictEqual(event.retry, '1000')
  })

  test('Should set id field', (t) => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    const event = {}

    stream.parseLine(Buffer.from('id: 1234', 'utf8'), event)

    t.assert.strictEqual(typeof event, 'object')
    t.assert.strictEqual(Object.keys(event).length, 1)
    t.assert.strictEqual(event.data, undefined)
    t.assert.strictEqual(event.id, '1234')
    t.assert.strictEqual(event.event, undefined)
    t.assert.strictEqual(event.retry, undefined)
  })

  test('Should set id field', (t) => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    const event = {}

    stream.parseLine(Buffer.from('event: custom', 'utf8'), event)

    t.assert.strictEqual(typeof event, 'object')
    t.assert.strictEqual(Object.keys(event).length, 1)
    t.assert.strictEqual(event.data, undefined)
    t.assert.strictEqual(event.id, undefined)
    t.assert.strictEqual(event.event, 'custom')
    t.assert.strictEqual(event.retry, undefined)
  })

  test('Should ignore invalid field', (t) => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    const event = {}

    stream.parseLine(Buffer.from('comment: invalid', 'utf8'), event)

    t.assert.strictEqual(typeof event, 'object')
    t.assert.strictEqual(Object.keys(event).length, 0)
    t.assert.strictEqual(event.data, undefined)
    t.assert.strictEqual(event.id, undefined)
    t.assert.strictEqual(event.event, undefined)
    t.assert.strictEqual(event.retry, undefined)
  })

  test('bogus retry', (t) => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    const event = {}
    'retry:3000\nretry:1000x\ndata:x'.split('\n').forEach((line) => {
      stream.parseLine(Buffer.from(line, 'utf8'), event)
    })

    t.assert.strictEqual(typeof event, 'object')
    t.assert.strictEqual(Object.keys(event).length, 2)
    t.assert.strictEqual(event.data, 'x')
    t.assert.strictEqual(event.id, undefined)
    t.assert.strictEqual(event.event, undefined)
    t.assert.strictEqual(event.retry, '3000')
  })

  test('bogus id', (t) => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    const event = {}
    'id:3000\nid:30\x000\ndata:x'.split('\n').forEach((line) => {
      stream.parseLine(Buffer.from(line, 'utf8'), event)
    })

    t.assert.strictEqual(typeof event, 'object')
    t.assert.strictEqual(Object.keys(event).length, 2)
    t.assert.strictEqual(event.data, 'x')
    t.assert.strictEqual(event.id, '3000')
    t.assert.strictEqual(event.event, undefined)
    t.assert.strictEqual(event.retry, undefined)
  })

  test('empty event', (t) => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    const event = {}
    'event: \ndata:data'.split('\n').forEach((line) => {
      stream.parseLine(Buffer.from(line, 'utf8'), event)
    })

    t.assert.strictEqual(typeof event, 'object')
    t.assert.strictEqual(Object.keys(event).length, 1)
    t.assert.strictEqual(event.data, 'data')
    t.assert.strictEqual(event.id, undefined)
    t.assert.strictEqual(event.event, undefined)
    t.assert.strictEqual(event.retry, undefined)
  })
})
