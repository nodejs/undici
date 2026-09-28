'use strict'

const assert = require('node:assert')
const { once, EventEmitter, getEventListeners } = require('node:events')
const { createServer } = require('node:http')
const { test, after } = require('node:test')
const { interceptors, errors, Client } = require('../..')
const { signal } = interceptors

function startServer (handler) {
  const server = createServer({ joinDuplicateHeaders: true }, handler)

  server.listen(0)

  return once(server, 'listening').then(() => server)
}

function createHandler (events) {
  let resolve
  const completed = new Promise((_resolve) => {
    resolve = _resolve
  })

  return {
    completed,
    error: null,
    onRequestStart (controller, context) {
      events.push('onRequestStart')
    },
    onResponseStart (controller, statusCode, headers, statusMessage) {
      events.push('onResponseStart')
    },
    onResponseData (controller, chunk) {
      events.push('onResponseData')
    },
    onResponseEnd (controller, trailers) {
      events.push('onResponseEnd')
      resolve()
    },
    onResponseError (controller, err) {
      events.push('onResponseError')
      this.error = err
      resolve()
    }
  }
}

test('aborts the request when the signal is already aborted', async () => {
  const server = await startServer((req, res) => {
    res.end('hello')
  })

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(signal())

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  const reason = new Error('pre-aborted')
  const ac = new AbortController()
  ac.abort(reason)

  const events = []
  const handler = createHandler(events)

  client.dispatch({ method: 'GET', path: '/', signal: ac.signal }, handler)
  await handler.completed

  assert.deepStrictEqual(events, ['onResponseError'])
  assert.strictEqual(handler.error, reason)
})

test('aborts an in-flight request when the signal is aborted', async () => {
  const server = await startServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.write('partial')
  })

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(signal())

  after(async () => {
    await client.destroy()
    server.close()

    await once(server, 'close')
  })

  const reason = new Error('custom abort reason')
  const ac = new AbortController()

  const events = []
  const handler = createHandler(events)
  handler.onResponseData = (controller, chunk) => {
    events.push('onResponseData')
    ac.abort(reason)
  }

  client.dispatch({ method: 'GET', path: '/', signal: ac.signal }, handler)
  await handler.completed

  assert.deepStrictEqual(events, [
    'onRequestStart',
    'onResponseStart',
    'onResponseData',
    'onResponseError'
  ])
  assert.strictEqual(handler.error, reason)
  assert.strictEqual(getEventListeners(ac.signal, 'abort').length, 0)
})

test('supports EventEmitter-style signals', async () => {
  const server = await startServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.write('partial')
  })

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(signal())

  after(async () => {
    await client.destroy()
    server.close()

    await once(server, 'close')
  })

  const ee = new EventEmitter()

  const events = []
  const handler = createHandler(events)
  handler.onResponseData = (controller, chunk) => {
    events.push('onResponseData')
    ee.emit('abort')
  }

  client.dispatch({ method: 'GET', path: '/', signal: ee }, handler)
  await handler.completed

  assert.ok(handler.error instanceof errors.RequestAbortedError)
  assert.strictEqual(ee.listenerCount('abort'), 0)
})

test('removes the abort listener once the response completes', async () => {
  const server = await startServer((req, res) => {
    res.end('hello')
  })

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(signal())

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  const ac = new AbortController()

  const events = []
  const handler = createHandler(events)

  client.dispatch({ method: 'GET', path: '/', signal: ac.signal }, handler)
  await handler.completed

  assert.deepStrictEqual(events, [
    'onRequestStart',
    'onResponseStart',
    'onResponseData',
    'onResponseEnd'
  ])
  assert.strictEqual(handler.error, null)
  assert.strictEqual(getEventListeners(ac.signal, 'abort').length, 0)

  // Aborting after completion must not affect the finished request.
  ac.abort()
})

test('removes the abort listener when the request errors', async () => {
  const server = await startServer((req, res) => {
    res.destroy()
  })

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(signal())

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  const ac = new AbortController()

  const events = []
  const handler = createHandler(events)

  client.dispatch({ method: 'GET', path: '/', signal: ac.signal }, handler)
  await handler.completed

  assert.ok(handler.error)
  assert.strictEqual(getEventListeners(ac.signal, 'abort').length, 0)
})

test('does not interfere when no signal is provided', async () => {
  const server = await startServer((req, res) => {
    res.end('hello')
  })

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(signal())

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  const response = await client.request({ method: 'GET', path: '/' })

  assert.strictEqual(response.statusCode, 200)
  assert.strictEqual(await response.body.text(), 'hello')
})

test('throws when the signal is not an EventEmitter or EventTarget', async () => {
  const server = await startServer((req, res) => {
    res.end('hello')
  })

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(signal())

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  assert.throws(
    () => client.dispatch(
      { method: 'GET', path: '/', signal: 'not-a-signal' },
      createHandler([])
    ),
    errors.InvalidArgumentError
  )
})

test('works with client.request', async () => {
  const server = await startServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.write('partial')
  })

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(signal())

  after(async () => {
    await client.destroy()
    server.close()

    await once(server, 'close')
  })

  const reason = new Error('custom abort reason')
  const ac = new AbortController()

  const response = await client.request({ method: 'GET', path: '/', signal: ac.signal })
  ac.abort(reason)

  await assert.rejects(response.body.text(), reason)
})
