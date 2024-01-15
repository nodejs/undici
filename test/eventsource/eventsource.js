'use strict'

const assert = require('node:assert')
const events = require('node:events')
const http = require('node:http')
const { test, describe } = require('node:test')
const { EventSource } = require('../../lib/eventsource')

describe('EventSource - constructor', () => {
  test('Not providing url argument should throw', () => {
    assert.throws(() => new EventSource(), TypeError)
  })
})

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
      function fn () { }
      eventSourceInstance[type] = fn
      assert.strictEqual(eventSourceInstance[type], fn)

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

describe('EventSource - redirecting', () => {
  [301, 302, 307, 308].forEach((statusCode) => {
    test(`Should redirect on ${statusCode} status code`, async () => {
      const server = http.createServer((req, res) => {
        if (res.req.url === '/redirect') {
          res.writeHead(statusCode, undefined, { Location: '/target' })
          res.end()
        } else if (res.req.url === '/target') {
          res.writeHead(200, 'dummy', { 'Content-Type': 'text/event-stream' })
          res.end()
        }
      })

      server.listen(0)
      await events.once(server, 'listening')

      const port = server.address().port

      const eventSourceInstance = new EventSource(`http://localhost:${port}/redirect`)
      eventSourceInstance.onerror = (e) => {
        assert.fail('Should not have errored')
      }
      eventSourceInstance.onopen = () => {
        // assert.strictEqual(eventSourceInstance.url, `http://localhost:${port}/target`)
        eventSourceInstance.close()
        server.close()
      }
    })
  })
})

describe('EventSource - stop redirecting on 204 status code', async () => {
  test('Stop trying to connect when getting a 204 response', async () => {
    const server = http.createServer((req, res) => {
      if (res.req.url === '/redirect') {
        res.writeHead(301, undefined, { Location: '/target' })
        res.end()
      } else if (res.req.url === '/target') {
        res.writeHead(204, 'OK')
        res.end()
      }
    })

    server.listen(0)
    await events.once(server, 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}/redirect`)
    eventSourceInstance.onerror = (event) => {
      assert.strictEqual(event.message, 'No content')
      // TODO: fetching does not set the url properly?
      // assert.strictEqual(eventSourceInstance.url, `http://localhost:${port}/target`)
      assert.strictEqual(eventSourceInstance.readyState, EventSource.CLOSED)
      server.close()
    }
    eventSourceInstance.onopen = () => {
      assert.fail('Should not have opened')
    }
  })
})

describe('EventSource - Location header', () => {
  test('Throw when missing a Location header', async () => {
    const server = http.createServer((req, res) => {
      if (res.req.url === '/redirect') {
        res.writeHead(301, undefined)
        res.end()
      } else if (res.req.url === '/target') {
        res.writeHead(204, 'OK')
        res.end()
      }
    })

    server.listen(0)
    await events.once(server, 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}/redirect`)
    eventSourceInstance.onerror = () => {
      assert.strictEqual(eventSourceInstance.url, `http://localhost:${port}/redirect`)
      assert.strictEqual(eventSourceInstance.readyState, EventSource.CLOSED)
      server.close()
    }
  })
})
