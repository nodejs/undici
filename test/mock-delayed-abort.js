'use strict'

const { test } = require('node:test')
const { MockAgent, interceptors } = require('..')
const DecoratorHandler = require('../lib/handler/decorator-handler')
const { tspl } = require('@matteo.collina/tspl')

test('MockAgent with delayed response and AbortSignal should not cause uncaught errors', async (t) => {
  const p = tspl(t, { plan: 2 })

  const agent = new MockAgent()
  t.after(() => agent.close())

  const mockPool = agent.get('https://example.com')
  mockPool.intercept({ path: '/test', method: 'GET' })
    .reply(200, { success: true }, { headers: { 'content-type': 'application/json' } })
    .delay(100)

  const ac = new AbortController()

  // Abort the request after 10ms
  setTimeout(() => {
    ac.abort(new Error('Request aborted'))
  }, 10)

  try {
    await agent.request({
      origin: 'https://example.com',
      path: '/test',
      method: 'GET',
      signal: ac.signal
    })
    p.fail('Should have thrown an error')
  } catch (err) {
    p.ok(err.message === 'Request aborted' || err.name === 'AbortError', 'Error should be related to abort')
  }

  // Wait for the delayed response to fire - should not cause any uncaught errors
  await new Promise(resolve => setTimeout(resolve, 150))

  p.ok(true, 'No uncaught errors after delayed response')
})

test('MockAgent with delayed response and composed interceptor (decompress) should not cause uncaught errors', async (t) => {
  const p = tspl(t, { plan: 2 })

  // The decompress interceptor has assertions that fail if onResponseStart is called after onError
  const agent = new MockAgent().compose(interceptors.decompress())
  t.after(() => agent.close())

  const mockPool = agent.get('https://example.com')
  mockPool.intercept({ path: '/test', method: 'GET' })
    .reply(200, { success: true }, { headers: { 'content-type': 'application/json' } })
    .delay(100)

  const ac = new AbortController()

  // Abort the request after 10ms
  setTimeout(() => {
    ac.abort(new Error('Request aborted'))
  }, 10)

  try {
    await agent.request({
      origin: 'https://example.com',
      path: '/test',
      method: 'GET',
      signal: ac.signal
    })
    p.fail('Should have thrown an error')
  } catch (err) {
    p.ok(err.message === 'Request aborted' || err.name === 'AbortError', 'Error should be related to abort')
  }

  // Wait for the delayed response to fire - should not cause any uncaught errors
  await new Promise(resolve => setTimeout(resolve, 150))

  p.ok(true, 'No uncaught errors after delayed response')
})

test('MockAgent with delayed response and DecoratorHandler should not call onResponseStart after onError', async (t) => {
  const p = tspl(t, { plan: 2 })

  class TestDecoratorHandler extends DecoratorHandler {
    #onErrorCalled = false

    onResponseStart (controller, statusCode, headers, statusMessage) {
      if (this.#onErrorCalled) {
        p.fail('onResponseStart should not be called after onError')
      }
      return super.onResponseStart(controller, statusCode, headers, statusMessage)
    }

    onResponseError (controller, err) {
      this.#onErrorCalled = true
      return super.onResponseError(controller, err)
    }
  }

  const agent = new MockAgent()
  t.after(() => agent.close())

  const mockPool = agent.get('https://example.com')
  mockPool.intercept({ path: '/test', method: 'GET' })
    .reply(200, { success: true }, { headers: { 'content-type': 'application/json' } })
    .delay(100)

  const ac = new AbortController()

  // Abort the request after 10ms
  setTimeout(() => {
    ac.abort(new Error('Request aborted'))
  }, 10)

  const originalDispatch = agent.dispatch.bind(agent)
  agent.dispatch = (opts, handler) => {
    const decoratedHandler = new TestDecoratorHandler(handler)
    return originalDispatch(opts, decoratedHandler)
  }

  try {
    await agent.request({
      origin: 'https://example.com',
      path: '/test',
      method: 'GET',
      signal: ac.signal
    })
    p.fail('Should have thrown an error')
  } catch (err) {
    p.ok(err.message === 'Request aborted' || err.name === 'AbortError', 'Error should be related to abort')
  }

  // Wait for the delayed response to fire
  await new Promise(resolve => setTimeout(resolve, 150))

  p.ok(true, 'Decorator handler invariants maintained')
})

test('MockAgent abort before an async reply options callback rejects should settle onResponseError exactly once', async (t) => {
  const p = tspl(t, { plan: 2 })

  let onResponseErrorCount = 0

  class CountingHandler extends DecoratorHandler {
    onResponseError (controller, err) {
      onResponseErrorCount++
      return super.onResponseError(controller, err)
    }
  }

  const agent = new MockAgent()
  t.after(() => agent.close())

  const mockPool = agent.get('https://example.com')

  // An async reply *options* callback whose promise rejects only after the
  // request has already been aborted. A request body forces the callback to be
  // resolved inside dispatchMockReply (rather than eagerly in mockDispatch), so
  // the controller is already live and the abort can win the race.
  mockPool.intercept({ path: '/test', method: 'POST' })
    .reply(() => new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error('reply callback failed')), 50)
    }))

  const ac = new AbortController()

  // Abort after the callback has been invoked but before its promise rejects.
  setTimeout(() => {
    ac.abort(new Error('Request aborted'))
  }, 10)

  const originalDispatch = agent.dispatch.bind(agent)
  agent.dispatch = (opts, handler) => {
    return originalDispatch(opts, new CountingHandler(handler))
  }

  try {
    await agent.request({
      origin: 'https://example.com',
      path: '/test',
      method: 'POST',
      body: 'a request body',
      signal: ac.signal
    })
    p.fail('Should have thrown an error')
  } catch (err) {
    p.ok(err.message === 'Request aborted' || err.name === 'AbortError', 'Error should be related to abort')
  }

  // Wait for the rejecting callback promise to settle (at ~50ms).
  await new Promise(resolve => setTimeout(resolve, 150))

  p.strictEqual(onResponseErrorCount, 1, 'onResponseError must fire exactly once for an aborted request')
})
