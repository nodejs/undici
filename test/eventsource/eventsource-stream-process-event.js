'use strict'

const assert = require('node:assert')
const { test, describe } = require('node:test')
const { EventSourceStream } = require('../../lib/web/eventsource/eventsource-stream')

describe('EventSourceStream - processEvent', () => {
  const defaultEventSourceSettings = {
    origin: 'example.com',
    reconnectionTime: 1000
  }

  test('Should set the defined origin as the origin of the MessageEvent', () => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    stream.on('data', (event) => {
      assert.strictEqual(typeof event, 'object')
      assert.strictEqual(event.type, 'message')
      assert.strictEqual(event.options.data, null)
      assert.strictEqual(event.options.lastEventId, undefined)
      assert.strictEqual(event.options.origin, 'example.com')
      assert.strictEqual(stream.state.reconnectionTime, 1000)
    })

    stream.on('error', (error) => {
      assert.fail(error)
    })

    stream.processEvent({})
  })

  test('Should set reconnectionTime to 4000 if event contains retry field', () => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    stream.processEvent({
      retry: '4000'
    })

    assert.strictEqual(stream.state.reconnectionTime, 4000)
  })

  test('Dispatches a MessageEvent with data', () => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    stream.on('data', (event) => {
      assert.strictEqual(typeof event, 'object')
      assert.strictEqual(event.type, 'message')
      assert.strictEqual(event.options.data, 'Hello')
      assert.strictEqual(event.options.lastEventId, undefined)
      assert.strictEqual(event.options.origin, 'example.com')
      assert.strictEqual(stream.state.reconnectionTime, 1000)
    })

    stream.on('error', (error) => {
      assert.fail(error)
    })

    stream.processEvent({
      data: 'Hello'
    })
  })

  test('Dispatches a MessageEvent with lastEventId, when event contains id field', () => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    stream.on('data', (event) => {
      assert.strictEqual(typeof event, 'object')
      assert.strictEqual(event.type, 'message')
      assert.strictEqual(event.options.data, null)
      assert.strictEqual(event.options.lastEventId, '1234')
      assert.strictEqual(event.options.origin, 'example.com')
      assert.strictEqual(stream.state.reconnectionTime, 1000)
    })

    stream.processEvent({
      id: '1234'
    })
  })

  test('Dispatches a MessageEvent with lastEventId, reusing the persisted', () => {
    // lastEventId
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings,
        lastEventId: '1234'
      }
    })

    stream.on('data', (event) => {
      assert.strictEqual(typeof event, 'object')
      assert.strictEqual(event.type, 'message')
      assert.strictEqual(event.options.data, null)
      assert.strictEqual(event.options.lastEventId, '1234')
      assert.strictEqual(event.options.origin, 'example.com')
      assert.strictEqual(stream.state.reconnectionTime, 1000)
    })

    stream.processEvent({})
  })

  test('Dispatches a MessageEvent with type custom, when event contains type field', () => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    stream.on('data', (event) => {
      assert.strictEqual(typeof event, 'object')
      assert.strictEqual(event.type, 'custom')
      assert.strictEqual(event.options.data, null)
      assert.strictEqual(event.options.lastEventId, undefined)
      assert.strictEqual(event.options.origin, 'example.com')
      assert.strictEqual(stream.state.reconnectionTime, 1000)
    })

    stream.processEvent({
      event: 'custom'
    })
  })
})
