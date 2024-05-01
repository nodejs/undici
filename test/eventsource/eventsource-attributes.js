'use strict'

const assert = require('node:assert')
const events = require('node:events')
const http = require('node:http')
const { test, describe } = require('node:test')
const { EventSource } = require('../../lib/web/eventsource/eventsource')

describe('EventSource - eventhandler idl', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, 'dummy')
  })

  server.listen(0)
  await events.once(server, 'listening')
  const port = server.address().port

  let done = 0
  const eventhandlerIdl = ['onmessage', 'onerror', 'onopen']

  eventhandlerIdl.forEach((type) => {
    test(`Should properly configure the ${type} eventhandler idl`, () => {
      const eventSourceInstance = new EventSource(`http://localhost:${port}`)

      // Eventsource eventhandler idl is by default null,
      assert.strictEqual(eventSourceInstance[type], null)

      // The eventhandler idl is by default not enumerable.
      assert.strictEqual(Object.prototype.propertyIsEnumerable.call(eventSourceInstance, type), false)

      // The eventhandler idl ignores non-functions.
      eventSourceInstance[type] = 7
      assert.strictEqual(EventSource[type], undefined)

      // The eventhandler idl accepts functions.
      function fn () {
        assert.fail('Should not have called the eventhandler')
      }
      eventSourceInstance[type] = fn
      assert.strictEqual(eventSourceInstance[type], fn)

      // The eventhandler idl can be set to another function.
      function fn2 () { }
      eventSourceInstance[type] = fn2
      assert.strictEqual(eventSourceInstance[type], fn2)

      // The eventhandler idl overrides the previous function.
      eventSourceInstance.dispatchEvent(new Event(type))

      eventSourceInstance.close()
      done++

      if (done === eventhandlerIdl.length) server.close()
    })
  })
})

describe('EventSource - constants', () => {
  [
    ['CONNECTING', 0],
    ['OPEN', 1],
    ['CLOSED', 2]
  ].forEach((config) => {
    test(`Should expose the ${config[0]} constant`, () => {
      const [constant, value] = config

      // EventSource exposes the constant.
      assert.strictEqual(Object.hasOwn(EventSource, constant), true)

      // The value is properly set.
      assert.strictEqual(EventSource[constant], value)

      // The constant is enumerable.
      assert.strictEqual(Object.prototype.propertyIsEnumerable.call(EventSource, constant), true)

      // The constant is not writable.
      try {
        EventSource[constant] = 666
      } catch (e) {
        assert.strictEqual(e instanceof TypeError, true)
      }
      // The constant is not configurable.
      try {
        delete EventSource[constant]
      } catch (e) {
        assert.strictEqual(e instanceof TypeError, true)
      }
      assert.strictEqual(EventSource[constant], value)
    })
  })
})
