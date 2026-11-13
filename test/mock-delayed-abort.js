'use strict'

const { test } = require('node:test')
const { MockAgent, interceptors } = require('..')
const DecoratorHandler = require('../lib/handler/decorator-handler')
const { tspl } = require('@matteo.collina/tspl')

test('MockAgent with delayed response and AbortSignal must not deliver the response after abort', async (t) => {
  const p = tspl(t, { plan: 2 })

  const agent = new MockAgent()
  t.after(() => agent.close())

  const mockPool = agent.get('https://example.com')
  mockPool.intercept({ path: '/test', method: 'GET' })
    .reply(200, { success: true }, { headers: { 'content-type': 'application/json' } })
    .delay(100)

  // Observe the handler contract directly: once the request is aborted
  // (onResponseError), the delayed reply must never reach onResponseStart /
  // onResponseData / onResponseEnd. Without this the test could only assert
  // `true`, which stays green even if the delayed reply is delivered on top
  // of the abort — a tautology. The DecoratorHandler test below asserts only
  // onResponseStart is not called after onError; here we assert the whole
  // response side of the contract (start, data and end) is suppressed.
  let onErrorCalled = false
  let deliveredAfterError = false

  class TrackingDecoratorHandler extends DecoratorHandler {
    #flag () {
      if (onErrorCalled) {
        deliveredAfterError = true
      }
    }

    onResponseStart (...args) {
      this.#flag()
      return super.onResponseStart(...args)
    }

    onResponseData (...args) {
      this.#flag()
      return super.onResponseData(...args)
    }

    onResponseEnd (...args) {
      this.#flag()
      return super.onResponseEnd(...args)
    }

    onResponseError (controller, err) {
      onErrorCalled = true
      return super.onResponseError(controller, err)
    }
  }

  const originalDispatch = agent.dispatch.bind(agent)
  agent.dispatch = (opts, handler) => {
    return originalDispatch(opts, new TrackingDecoratorHandler(handler))
  }

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

  // Wait for the delayed response to fire; it must be dropped, not delivered.
  await new Promise(resolve => setTimeout(resolve, 150))

  p.strictEqual(deliveredAfterError, false, 'delayed response must not be delivered after the abort')
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
