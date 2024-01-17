'use strict'

const assert = require('node:assert')
const { test, describe } = require('node:test')
const { EventSourceStream } = require('../../lib/eventsource/eventsource-stream')

describe('EventSourceStream - processEvent', () => {
  const defaultEventSourceState = {
    origin: 'example.com',
    reconnectionTime: 1000
  }

  test('Should set the defined origin as the origin of the MessageEvent', () => {
    const stream = new EventSourceStream({
      eventSourceState: {
        ...defaultEventSourceState
      }
    })

    stream.on('data', (event) => {
      assert.strictEqual(typeof event, 'object')
      assert.strictEqual(event.type, 'message')
      assert.strictEqual(event.payload.data, null)
      assert.strictEqual(event.payload.lastEventId, undefined)
      assert.strictEqual(event.payload.origin, 'example.com')
      assert.strictEqual(stream.state.reconnectionTime, 1000)
    })

    stream.processEvent({})
  })

  test('Should set reconnectionTime to 4000 if event contains retry field', () => {
    const stream = new EventSourceStream({
      eventSourceState: {
        ...defaultEventSourceState
      }
    })

    stream.processEvent({
      retry: '4000'
    })

    assert.strictEqual(stream.state.reconnectionTime, 4000)
  })

  test('Dispatches a MessageEvent with data', () => {
    const stream = new EventSourceStream({
      eventSourceState: {
        ...defaultEventSourceState
      }
    })

    stream.on('data', (event) => {
      assert.strictEqual(typeof event, 'object')
      assert.strictEqual(event.type, 'message')
      assert.strictEqual(event.payload.data, 'Hello')
      assert.strictEqual(event.payload.lastEventId, undefined)
      assert.strictEqual(event.payload.origin, 'example.com')
      assert.strictEqual(stream.state.reconnectionTime, 1000)
    })

    stream.processEvent({
      data: 'Hello'
    })
  })

  test('Dispatches a MessageEvent with lastEventId, when event contains id field', () => {
    const stream = new EventSourceStream({
      eventSourceState: {
        ...defaultEventSourceState
      }
    })

    stream.on('data', (event) => {
      assert.strictEqual(typeof event, 'object')
      assert.strictEqual(event.type, 'message')
      assert.strictEqual(event.payload.data, null)
      assert.strictEqual(event.payload.lastEventId, '1234')
      assert.strictEqual(event.payload.origin, 'example.com')
      assert.strictEqual(stream.state.reconnectionTime, 1000)
    })

    stream.processEvent({
      id: '1234'
    })
  })

  test('Dispatches a MessageEvent with lastEventId, reusing the persisted', () => {
    // lastEventId
    const stream = new EventSourceStream({
      eventSourceState: {
        ...defaultEventSourceState,
        lastEventId: '1234'
      }
    })

    stream.on('data', (event) => {
      assert.strictEqual(typeof event, 'object')
      assert.strictEqual(event.type, 'message')
      assert.strictEqual(event.payload.data, null)
      assert.strictEqual(event.payload.lastEventId, '1234')
      assert.strictEqual(event.payload.origin, 'example.com')
      assert.strictEqual(stream.state.reconnectionTime, 1000)
    })

    stream.processEvent({})
  })

  test('Dispatches a MessageEvent with type custom, when event contains type field', () => {
    const stream = new EventSourceStream({
      eventSourceState: {
        ...defaultEventSourceState
      }
    })

    stream.on('data', (event) => {
      assert.strictEqual(typeof event, 'object')
      assert.strictEqual(event.type, 'custom')
      assert.strictEqual(event.payload.data, null)
      assert.strictEqual(event.payload.lastEventId, undefined)
      assert.strictEqual(event.payload.origin, 'example.com')
      assert.strictEqual(stream.state.reconnectionTime, 1000)
    })

    stream.processEvent({
      event: 'custom'
    })
  })
})

describe('EventSourceStream', () => {
  test('Remove BOM from the beginning of the stream.', () => {
    const content = Buffer.from('\uFEFFdata: Hello\n\n', 'utf8')

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
      assert.fail('Should not be called')
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
