'use strict'

const { once } = require('node:events')
const http = require('node:http')
const { test, describe, after } = require('node:test')
const FakeTimers = require('@sinonjs/fake-timers')
const { EventSource, defaultReconnectionTime } = require('../../lib/web/eventsource/eventsource')
const { randomInt } = require('node:crypto')

describe('EventSource - sending correct request headers', () => {
  test('should send request with connection keep-alive', async (t) => {
    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      t.assert.strictEqual(req.headers.connection, 'keep-alive')
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.end()
    })

    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.onopen = (t) => {
      eventSourceInstance.close()
      server.close()
    }

    eventSourceInstance.onerror = (t) => {
      t.assert.fail('Should not have errored')
    }
  })

  test('should send request with sec-fetch-mode set to cors', async (t) => {
    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      t.assert.strictEqual(req.headers['sec-fetch-mode'], 'cors')
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.end()
    })

    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.onopen = (t) => {
      eventSourceInstance.close()
      server.close()
    }

    eventSourceInstance.onerror = (t) => {
      t.assert.fail('Should not have errored')
    }
  })

  test('should send request with pragma and cache-control set to no-cache', async (t) => {
    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      t.assert.strictEqual(req.headers['cache-control'], 'no-cache')
      t.assert.strictEqual(req.headers.pragma, 'no-cache')
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.end()
    })

    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.onopen = (t) => {
      eventSourceInstance.close()
      server.close()
    }

    eventSourceInstance.onerror = (t) => {
      t.assert.fail('Should not have errored')
    }
  })

  test('should send request with accept text/event-stream', async (t) => {
    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      t.assert.strictEqual(req.headers.accept, 'text/event-stream')
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.end()
    })

    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.onopen = (t) => {
      eventSourceInstance.close()
      server.close()
    }

    eventSourceInstance.onerror = (t) => {
      t.assert.fail('Should not have errored')
    }
  })
})

describe('EventSource - received response must have content-type to be text/event-stream', () => {
  test('should send request with accept text/event-stream', async (t) => {
    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.end()
    })

    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.onopen = (t) => {
      eventSourceInstance.close()
      server.close()
    }

    eventSourceInstance.onerror = (t) => {
      t.assert.fail('Should not have errored')
    }
  })

  test('should send request with accept text/event-stream;', async (t) => {
    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream;' })
      res.end()
    })

    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.onopen = (t) => {
      eventSourceInstance.close()
      server.close()
    }

    eventSourceInstance.onerror = (t) => {
      t.assert.fail('Should not have errored')
    }
  })

  test('should handle content-type text/event-stream;charset=UTF-8 properly', async (t) => {
    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream;charset=UTF-8' })
      res.end()
    })

    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.onopen = (t) => {
      eventSourceInstance.close()
      server.close()
    }

    eventSourceInstance.onerror = (t) => {
      t.assert.fail('Should not have errored')
    }
  })

  test('should throw if content-type is text/html properly', async (t) => {
    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/html' })
      res.end()
    })

    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.onopen = (t) => {
      t.assert.fail('Should not have opened')
    }

    eventSourceInstance.onerror = (t) => {
      eventSourceInstance.close()
      server.close()
    }
  })

  test('should try to connect again if server is unreachable', async (t) => {
    const clock = FakeTimers.install()

    after(() => clock.uninstall())
    const reconnectionTime = defaultReconnectionTime
    const domain = 'bad.n' + randomInt(1e10).toString(36) + '.proxy'

    const eventSourceInstance = new EventSource(`http://${domain}`)

    const onerrorCalls = []
    eventSourceInstance.onerror = (error) => {
      onerrorCalls.push(error)
    }
    clock.tick(reconnectionTime)

    await once(eventSourceInstance, 'error')

    const start = Date.now()
    clock.tick(reconnectionTime)
    await once(eventSourceInstance, 'error')
    clock.tick(reconnectionTime)
    await once(eventSourceInstance, 'error')
    clock.tick(reconnectionTime)
    await once(eventSourceInstance, 'error')
    const end = Date.now()

    eventSourceInstance.close()

    t.assert.strictEqual(onerrorCalls.length, 4, 'Expected 4 error events')
    t.assert.strictEqual(end - start, 3 * reconnectionTime, `Expected reconnection to happen after ${3 * reconnectionTime}ms, but took ${end - start}ms`)
  })

  test('should try to connect again if server is unreachable, configure reconnectionTime', async (t) => {
    const reconnectionTime = 1000
    const clock = FakeTimers.install()
    after(() => clock.uninstall())

    const domain = 'bad.n' + randomInt(1e10).toString(36) + '.proxy'

    const eventSourceInstance = new EventSource(`http://${domain}`, {
      node: {
        reconnectionTime
      }
    })

    const onerrorCalls = []
    eventSourceInstance.onerror = (error) => {
      onerrorCalls.push(error)
    }

    await once(eventSourceInstance, 'error')

    const start = Date.now()
    clock.tick(reconnectionTime)
    await once(eventSourceInstance, 'error')
    clock.tick(reconnectionTime)
    await once(eventSourceInstance, 'error')
    clock.tick(reconnectionTime)
    await once(eventSourceInstance, 'error')
    const end = Date.now()

    eventSourceInstance.close()

    t.assert.strictEqual(onerrorCalls.length, 4, 'Expected 4 error events')
    t.assert.strictEqual(end - start, 3 * reconnectionTime, `Expected reconnection to happen after ${3 * reconnectionTime}ms, but took ${end - start}ms`)
  })
})
