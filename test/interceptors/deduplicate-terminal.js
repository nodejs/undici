'use strict'

const { test } = require('node:test')
const DeduplicationHandler = require('../../lib/handler/deduplication-handler')
const deduplicate = require('../../lib/interceptor/deduplicate')

for (const errorCallbackThrows of [false, true]) {
  test(`completion failures notify each handler and clean up (error callback throws: ${errorCallbackThrows})`, t => {
    const events = []
    const endError = new Error('completion failed')
    const callbackError = new Error('error callback failed')
    const controller = { aborted: false }
    const trailers = { checksum: 'value' }
    const handler = new DeduplicationHandler({
      onResponseEnd (receivedController, receivedTrailers) {
        events.push(['primary end', receivedController, receivedTrailers])
        throw endError
      },
      onResponseError (receivedController, err) {
        events.push(['primary error', receivedController, err])
        if (errorCallbackThrows) {
          throw callbackError
        }
      }
    }, () => events.push(['cleanup']))

    let waitingController
    handler.addWaitingHandler({
      onRequestStart (controller) {
        waitingController = controller
      },
      onResponseEnd (controller, receivedTrailers) {
        events.push(['waiting end', controller, receivedTrailers])
        throw endError
      },
      onResponseError (controller, err) {
        events.push(['waiting error', controller, err, controller.aborted])
        throw callbackError
      }
    })
    handler.addWaitingHandler({
      onResponseEnd (_controller, receivedTrailers) {
        events.push(['other end', receivedTrailers])
      }
    })

    if (errorCallbackThrows) {
      t.assert.throws(() => handler.onResponseEnd(controller, trailers), err => err === callbackError)
    } else {
      handler.onResponseEnd(controller, trailers)
    }

    // Late transport notifications must neither repeat cleanup nor redeliver
    // terminal callbacks after a downstream callback has thrown.
    handler.onResponseError(controller, callbackError)
    handler.onResponseEnd(controller, trailers)
    t.assert.strictEqual(handler.addWaitingHandler({}), false)
    t.assert.deepStrictEqual(events, [
      ['cleanup'],
      ['primary end', controller, trailers],
      ['primary error', controller, endError],
      ['waiting end', waitingController, trailers],
      ['waiting error', waitingController, endError, false],
      ['other end', trailers]
    ])
  })
}

test('a paused waiting handler receives completion errors without being aborted', t => {
  const events = []
  const endError = new Error('completion failed')
  const trailers = { checksum: 'value' }
  const handler = new DeduplicationHandler({
    onResponseEnd () {
      events.push(['primary end'])
    }
  }, () => events.push(['cleanup']))

  let waitingController
  handler.addWaitingHandler({
    onRequestStart (controller) {
      waitingController = controller
      controller.pause()
    },
    onResponseData (_controller, chunk) {
      events.push(['data', chunk.toString()])
    },
    onResponseEnd (controller, receivedTrailers) {
      events.push(['waiting end', receivedTrailers])
      // Reentrant resume must not deliver the stored trailers twice.
      controller.resume()
      throw endError
    },
    onResponseError (controller, err) {
      events.push(['waiting error', err, controller.aborted])
    }
  })

  handler.onResponseData({}, Buffer.from('body'))
  handler.onResponseEnd({}, trailers)
  t.assert.deepStrictEqual(events, [['cleanup'], ['primary end']])

  waitingController.resume()
  waitingController.resume()
  t.assert.deepStrictEqual(events, [
    ['cleanup'],
    ['primary end'],
    ['data', 'body'],
    ['waiting end', trailers],
    ['waiting error', endError, false]
  ])
})

test('a paused waiting handler defers completion even without buffered data', t => {
  const events = []
  const trailers = { checksum: 'value' }
  const handler = new DeduplicationHandler({}, () => events.push('cleanup'))
  let waitingController
  handler.addWaitingHandler({
    onRequestStart (controller) {
      waitingController = controller
      controller.pause()
    },
    onResponseEnd (controller, receivedTrailers) {
      events.push(receivedTrailers)
      controller.resume()
    }
  })

  handler.onResponseEnd({}, trailers)
  t.assert.deepStrictEqual(events, ['cleanup'])

  waitingController.resume()
  waitingController.resume()
  t.assert.deepStrictEqual(events, ['cleanup', trailers])
})

test('a throwing primary error callback does not prevent cleanup or waiting errors', t => {
  const events = []
  const responseError = new Error('response failed')
  const callbackError = new Error('error callback failed')
  const handler = new DeduplicationHandler({
    onResponseError (_controller, err) {
      events.push(['primary error', err])
      throw callbackError
    }
  }, () => events.push(['cleanup']))

  handler.addWaitingHandler({
    onResponseError (_controller, err) {
      events.push(['waiting error', err])
      throw callbackError
    }
  })
  handler.addWaitingHandler({
    onResponseError (_controller, err) {
      events.push(['other error', err])
    }
  })

  t.assert.throws(() => handler.onResponseError({}, responseError), err => err === callbackError)
  handler.onResponseError({}, responseError)
  handler.onResponseEnd({}, {})
  t.assert.strictEqual(handler.addWaitingHandler({}), false)
  t.assert.deepStrictEqual(events, [
    ['cleanup'],
    ['primary error', responseError],
    ['waiting error', responseError],
    ['other error', responseError]
  ])
})

for (const terminalEvent of ['end', 'error', 'completion failure']) {
  test(`removes the pending entry before redispatch from ${terminalEvent}`, t => {
    const dispatched = []
    const completed = []
    const opts = { origin: 'http://example.test', method: 'GET', path: '/' }
    const dispatch = deduplicate()((_opts, handler) => {
      dispatched.push(handler)
      return true
    })
    const responseError = new Error('response failed')

    function redispatch () {
      dispatch(opts, {
        onResponseEnd () { completed.push('primary') }
      })
      dispatch(opts, {
        onResponseEnd () { completed.push('waiting') }
      })
    }

    dispatch(opts, {
      onResponseEnd () {
        if (terminalEvent === 'completion failure') {
          throw responseError
        }
        redispatch()
      },
      onResponseError () {
        redispatch()
      }
    })
    t.assert.strictEqual(dispatched.length, 1)

    if (terminalEvent === 'error') {
      dispatched[0].onResponseError({}, responseError)
    } else {
      dispatched[0].onResponseEnd({}, {})
    }

    // Both new callers must share a fresh pending entry, not bypass a stale,
    // completed entry. Finishing the old request must not remove the new one.
    t.assert.strictEqual(dispatched.length, 2)
    dispatch(opts, {
      onResponseEnd () { completed.push('late waiting') }
    })
    t.assert.strictEqual(dispatched.length, 2)
    dispatched[1].onResponseEnd({}, {})
    t.assert.deepStrictEqual(completed, ['primary', 'waiting', 'late waiting'])

    dispatch(opts, {})
    t.assert.strictEqual(dispatched.length, 3)
    dispatched[2].onResponseEnd({}, {})
  })
}
