'use strict'

const { test, describe } = require('node:test')
const { EventSourceStream } = require('../../lib/web/eventsource/eventsource-stream')

describe('EventSourceStream - processEvent', () => {
  const defaultEventSourceSettings = {
    origin: 'example.com',
    reconnectionTime: 1000
  }

  test('Should set the defined origin as the origin of the MessageEvent', (t) => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    stream.on('data', (event) => {
      t.assert.strictEqual(typeof event, 'object')
      t.assert.strictEqual(event.type, 'message')
      t.assert.strictEqual(event.options.data, null)
      t.assert.strictEqual(event.options.lastEventId, undefined)
      t.assert.strictEqual(event.options.origin, 'example.com')
      t.assert.strictEqual(stream.state.reconnectionTime, 1000)
    })

    stream.on('error', (error) => {
      t.assert.fail(error)
    })

    stream.processEvent({})
  })

  test('Should set reconnectionTime to 4000 if event contains retry field', (t) => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    stream.processEvent({
      retry: '4000'
    })

    t.assert.strictEqual(stream.state.reconnectionTime, 4000)
  })

  test('Dispatches a MessageEvent with data', (t) => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    stream.on('data', (event) => {
      t.assert.strictEqual(typeof event, 'object')
      t.assert.strictEqual(event.type, 'message')
      t.assert.strictEqual(event.options.data, 'Hello')
      t.assert.strictEqual(event.options.lastEventId, undefined)
      t.assert.strictEqual(event.options.origin, 'example.com')
      t.assert.strictEqual(stream.state.reconnectionTime, 1000)
    })

    stream.on('error', (error) => {
      t.assert.fail(error)
    })

    stream.processEvent({
      data: 'Hello'
    })
  })

  test('Dispatches a MessageEvent with lastEventId, when event contains id field', (t) => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    stream.on('data', (event) => {
      t.assert.strictEqual(typeof event, 'object')
      t.assert.strictEqual(event.type, 'message')
      t.assert.strictEqual(event.options.data, null)
      t.assert.strictEqual(event.options.lastEventId, '1234')
      t.assert.strictEqual(event.options.origin, 'example.com')
      t.assert.strictEqual(stream.state.reconnectionTime, 1000)
    })

    stream.processEvent({
      id: '1234'
    })
  })

  test('Dispatches a MessageEvent with lastEventId, reusing the persisted', (t) => {
    // lastEventId
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings,
        lastEventId: '1234'
      }
    })

    stream.on('data', (event) => {
      t.assert.strictEqual(typeof event, 'object')
      t.assert.strictEqual(event.type, 'message')
      t.assert.strictEqual(event.options.data, null)
      t.assert.strictEqual(event.options.lastEventId, '1234')
      t.assert.strictEqual(event.options.origin, 'example.com')
      t.assert.strictEqual(stream.state.reconnectionTime, 1000)
    })

    stream.processEvent({})
  })

  test('Dispatches a MessageEvent with type custom, when event contains type field', (t) => {
    const stream = new EventSourceStream({
      eventSourceSettings: {
        ...defaultEventSourceSettings
      }
    })

    stream.on('data', (event) => {
      t.assert.strictEqual(typeof event, 'object')
      t.assert.strictEqual(event.type, 'custom')
      t.assert.strictEqual(event.options.data, null)
      t.assert.strictEqual(event.options.lastEventId, undefined)
      t.assert.strictEqual(event.options.origin, 'example.com')
      t.assert.strictEqual(stream.state.reconnectionTime, 1000)
    })

    stream.processEvent({
      event: 'custom'
    })
  })
})
