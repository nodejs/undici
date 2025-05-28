'use strict'

const assert = require('node:assert')
const events = require('node:events')
const http = require('node:http')
const { test, describe } = require('node:test')
const { EventSource } = require('../../lib/web/eventsource/eventsource')

describe('EventSource - sending correct request headers', () => {
  test('should send request with connection keep-alive', async () => {
    const server = http.createServer((req, res) => {
      assert.strictEqual(req.headers.connection, 'keep-alive')
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.end()
    })

    server.listen(0)
    await events.once(server, 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.onopen = () => {
      eventSourceInstance.close()
      server.close()
    }

    eventSourceInstance.onerror = () => {
      assert.fail('Should not have errored')
    }
  })

  test('should send request with sec-fetch-mode set to cors', async () => {
    const server = http.createServer((req, res) => {
      assert.strictEqual(req.headers['sec-fetch-mode'], 'cors')
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.end()
    })

    server.listen(0)
    await events.once(server, 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.onopen = () => {
      eventSourceInstance.close()
      server.close()
    }

    eventSourceInstance.onerror = () => {
      assert.fail('Should not have errored')
    }
  })

  test('should send request with pragma and cache-control set to no-cache', async () => {
    const server = http.createServer((req, res) => {
      assert.strictEqual(req.headers['cache-control'], 'no-cache')
      assert.strictEqual(req.headers.pragma, 'no-cache')
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.end()
    })

    server.listen(0)
    await events.once(server, 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.onopen = () => {
      eventSourceInstance.close()
      server.close()
    }

    eventSourceInstance.onerror = () => {
      assert.fail('Should not have errored')
    }
  })

  test('should send request with accept text/event-stream', async () => {
    const server = http.createServer((req, res) => {
      assert.strictEqual(req.headers.accept, 'text/event-stream')
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.end()
    })

    server.listen(0)
    await events.once(server, 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.onopen = () => {
      eventSourceInstance.close()
      server.close()
    }

    eventSourceInstance.onerror = () => {
      assert.fail('Should not have errored')
    }
  })
})

describe('EventSource - received response must have content-type to be text/event-stream', () => {
  test('should send request with accept text/event-stream', async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.end()
    })

    server.listen(0)
    await events.once(server, 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.onopen = () => {
      eventSourceInstance.close()
      server.close()
    }

    eventSourceInstance.onerror = () => {
      assert.fail('Should not have errored')
    }
  })

  test('should send request with accept text/event-stream;', async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream;' })
      res.end()
    })

    server.listen(0)
    await events.once(server, 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.onopen = () => {
      eventSourceInstance.close()
      server.close()
    }

    eventSourceInstance.onerror = () => {
      assert.fail('Should not have errored')
    }
  })

  test('should handle content-type text/event-stream;charset=UTF-8 properly', async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream;charset=UTF-8' })
      res.end()
    })

    server.listen(0)
    await events.once(server, 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.onopen = () => {
      eventSourceInstance.close()
      server.close()
    }

    eventSourceInstance.onerror = () => {
      assert.fail('Should not have errored')
    }
  })

  test('should throw if content-type is text/html properly', async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/html' })
      res.end()
    })

    server.listen(0)
    await events.once(server, 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.onopen = () => {
      assert.fail('Should not have opened')
    }

    eventSourceInstance.onerror = () => {
      eventSourceInstance.close()
      server.close()
    }
  })
})
