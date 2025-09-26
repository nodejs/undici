'use strict'

const { once } = require('node:events')
const http = require('node:http')
const { test, describe, before, after } = require('node:test')
const { EventSource } = require('../../lib/web/eventsource/eventsource')

describe('EventSource - eventhandler idl', () => {
  let server
  let port

  before(async () => {
    server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.writeHead(200, 'dummy')
    })

    await once(server.listen(0), 'listening')
    port = server.address().port
  })

  after(() => { server.close() })

  const eventhandlerIdl = ['onmessage', 'onerror', 'onopen']

  eventhandlerIdl.forEach((type) => {
    test(`Should properly configure the ${type} eventhandler idl`, (t) => {
      const eventSourceInstance = new EventSource(`http://localhost:${port}`)

      // Eventsource eventhandler idl is by default null,
      t.assert.strictEqual(eventSourceInstance[type], null)

      // The eventhandler idl is by default not enumerable.
      t.assert.strictEqual(Object.prototype.propertyIsEnumerable.call(eventSourceInstance, type), false)

      // The eventhandler idl ignores non-functions.
      eventSourceInstance[type] = 7
      t.assert.strictEqual(EventSource[type], undefined)

      // The eventhandler idl accepts functions.
      function fn () {
        t.assert.fail('Should not have called the eventhandler')
      }
      eventSourceInstance[type] = fn
      t.assert.strictEqual(eventSourceInstance[type], fn)

      // The eventhandler idl can be set to another function.
      function fn2 () { }
      eventSourceInstance[type] = fn2
      t.assert.strictEqual(eventSourceInstance[type], fn2)

      // The eventhandler idl overrides the previous function.
      eventSourceInstance.dispatchEvent(new Event(type))

      eventSourceInstance.close()
    })
  })
})

describe('EventSource - constants', () => {
  [
    ['CONNECTING', 0],
    ['OPEN', 1],
    ['CLOSED', 2]
  ].forEach((config) => {
    test(`Should expose the ${config[0]} constant`, (t) => {
      const [constant, value] = config

      // EventSource exposes the constant.
      t.assert.strictEqual(Object.hasOwn(EventSource, constant), true)

      // The value is properly set.
      t.assert.strictEqual(EventSource[constant], value)

      // The constant is enumerable.
      t.assert.strictEqual(Object.prototype.propertyIsEnumerable.call(EventSource, constant), true)

      // The constant is not writable.
      try {
        EventSource[constant] = 666
      } catch (e) {
        t.assert.strictEqual(e instanceof TypeError, true)
      }
      // The constant is not configurable.
      try {
        delete EventSource[constant]
      } catch (e) {
        t.assert.strictEqual(e instanceof TypeError, true)
      }
      t.assert.strictEqual(EventSource[constant], value)
    })
  })
})
