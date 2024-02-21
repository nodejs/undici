'use strict'

const assert = require('node:assert')
const { test, describe } = require('node:test')
const { EventSourceStream } = require('../../lib/web/eventsource/eventsource-stream')

describe('EventSourceStream - parseLine', () => {
  const defaultEventSourceSettings = {
    origin: 'example.com',
    reconnectionTime: 1000
  }

  test('Should push an unmodified event when line is empty', () => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    const event = {}

    stream.parseLine(Buffer.from('', 'utf8'), event)

    assert.strictEqual(typeof event, 'object')
    assert.strictEqual(Object.keys(event).length, 0)
    assert.strictEqual(event.data, undefined)
    assert.strictEqual(event.id, undefined)
    assert.strictEqual(event.event, undefined)
    assert.strictEqual(event.retry, undefined)
  })

  test('Should set the data field with empty string if not containing data', () => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    const event = {}

    stream.parseLine(Buffer.from('data:', 'utf8'), event)

    assert.strictEqual(typeof event, 'object')
    assert.strictEqual(Object.keys(event).length, 1)
    assert.strictEqual(event.data, '')
    assert.strictEqual(event.id, undefined)
    assert.strictEqual(event.event, undefined)
    assert.strictEqual(event.retry, undefined)
  })

  test('Should set the data field with empty string if not containing data (containing space after colon)', () => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    const event = {}

    stream.parseLine(Buffer.from('data: ', 'utf8'), event)

    assert.strictEqual(typeof event, 'object')
    assert.strictEqual(Object.keys(event).length, 1)
    assert.strictEqual(event.data, '')
    assert.strictEqual(event.id, undefined)
    assert.strictEqual(event.event, undefined)
    assert.strictEqual(event.retry, undefined)
  })

  test('Should set the data field with a string containing space if having more than one space after colon', () => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    const event = {}

    stream.parseLine(Buffer.from('data:   ', 'utf8'), event)

    assert.strictEqual(typeof event, 'object')
    assert.strictEqual(Object.keys(event).length, 1)
    assert.strictEqual(event.data, '  ')
    assert.strictEqual(event.id, undefined)
    assert.strictEqual(event.event, undefined)
    assert.strictEqual(event.retry, undefined)
  })

  test('Should set value properly, even if the line contains multiple colons', () => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    const event = {}

    stream.parseLine(Buffer.from('data: : ', 'utf8'), event)

    assert.strictEqual(typeof event, 'object')
    assert.strictEqual(Object.keys(event).length, 1)
    assert.strictEqual(event.data, ': ')
    assert.strictEqual(event.id, undefined)
    assert.strictEqual(event.event, undefined)
    assert.strictEqual(event.retry, undefined)
  })

  test('Should set the data field when containing data', () => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    const event = {}

    stream.parseLine(Buffer.from('data: Hello', 'utf8'), event)

    assert.strictEqual(typeof event, 'object')
    assert.strictEqual(Object.keys(event).length, 1)
    assert.strictEqual(event.data, 'Hello')
    assert.strictEqual(event.id, undefined)
    assert.strictEqual(event.event, undefined)
    assert.strictEqual(event.retry, undefined)
  })

  test('Should ignore comments', () => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    const event = {}

    stream.parseLine(Buffer.from(':comment', 'utf8'), event)

    assert.strictEqual(typeof event, 'object')
    assert.strictEqual(Object.keys(event).length, 0)
    assert.strictEqual(event.data, undefined)
    assert.strictEqual(event.id, undefined)
    assert.strictEqual(event.event, undefined)
    assert.strictEqual(event.retry, undefined)
  })

  test('Should set retry field', () => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    const event = {}

    stream.parseLine(Buffer.from('retry: 1000', 'utf8'), event)

    assert.strictEqual(typeof event, 'object')
    assert.strictEqual(Object.keys(event).length, 1)
    assert.strictEqual(event.data, undefined)
    assert.strictEqual(event.id, undefined)
    assert.strictEqual(event.event, undefined)
    assert.strictEqual(event.retry, '1000')
  })

  test('Should set id field', () => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    const event = {}

    stream.parseLine(Buffer.from('id: 1234', 'utf8'), event)

    assert.strictEqual(typeof event, 'object')
    assert.strictEqual(Object.keys(event).length, 1)
    assert.strictEqual(event.data, undefined)
    assert.strictEqual(event.id, '1234')
    assert.strictEqual(event.event, undefined)
    assert.strictEqual(event.retry, undefined)
  })

  test('Should set id field', () => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    const event = {}

    stream.parseLine(Buffer.from('event: custom', 'utf8'), event)

    assert.strictEqual(typeof event, 'object')
    assert.strictEqual(Object.keys(event).length, 1)
    assert.strictEqual(event.data, undefined)
    assert.strictEqual(event.id, undefined)
    assert.strictEqual(event.event, 'custom')
    assert.strictEqual(event.retry, undefined)
  })

  test('Should ignore invalid field', () => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    const event = {}

    stream.parseLine(Buffer.from('comment: invalid', 'utf8'), event)

    assert.strictEqual(typeof event, 'object')
    assert.strictEqual(Object.keys(event).length, 0)
    assert.strictEqual(event.data, undefined)
    assert.strictEqual(event.id, undefined)
    assert.strictEqual(event.event, undefined)
    assert.strictEqual(event.retry, undefined)
  })

  test('bogus retry', () => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    const event = {}
    'retry:3000\nretry:1000x\ndata:x'.split('\n').forEach((line) => {
      stream.parseLine(Buffer.from(line, 'utf8'), event)
    })

    assert.strictEqual(typeof event, 'object')
    assert.strictEqual(Object.keys(event).length, 2)
    assert.strictEqual(event.data, 'x')
    assert.strictEqual(event.id, undefined)
    assert.strictEqual(event.event, undefined)
    assert.strictEqual(event.retry, '3000')
  })

  test('bogus id', () => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    const event = {}
    'id:3000\nid:30\x000\ndata:x'.split('\n').forEach((line) => {
      stream.parseLine(Buffer.from(line, 'utf8'), event)
    })

    assert.strictEqual(typeof event, 'object')
    assert.strictEqual(Object.keys(event).length, 2)
    assert.strictEqual(event.data, 'x')
    assert.strictEqual(event.id, '3000')
    assert.strictEqual(event.event, undefined)
    assert.strictEqual(event.retry, undefined)
  })

  test('empty event', () => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    const event = {}
    'event: \ndata:data'.split('\n').forEach((line) => {
      stream.parseLine(Buffer.from(line, 'utf8'), event)
    })

    assert.strictEqual(typeof event, 'object')
    assert.strictEqual(Object.keys(event).length, 1)
    assert.strictEqual(event.data, 'data')
    assert.strictEqual(event.id, undefined)
    assert.strictEqual(event.event, undefined)
    assert.strictEqual(event.retry, undefined)
  })
})
