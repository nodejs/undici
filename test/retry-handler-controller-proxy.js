'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test } = require('node:test')

const { RetryHandler } = require('..')

// These tests pin down the RetryController proxy contract introduced to keep
// flow-control wired to the active connection across transparent retries/resumes.
// Each retry/resume is a separate dispatch with its own connection controller;
// the downstream handler is handed ONE stable proxy that always forwards to the
// controller of the currently active connection. See lib/handler/retry-handler.js.

const baseOpts = {
  method: 'GET',
  path: '/',
  retryOptions: {}
}

// Stand-in for the per-dispatch RequestController of an active connection. It
// records the flow-control calls the proxy forwards to it.
function activeConnectionController () {
  const calls = []
  return {
    calls,
    paused: true,
    aborted: true,
    reason: new Error('boom'),
    rawHeaders: ['content-length', '2'],
    rawTrailers: ['x-trailer', 'value'],
    pause () { calls.push('pause') },
    resume () { calls.push('resume') },
    abort (reason) { calls.push(['abort', reason]) }
  }
}

test('controller proxy returns safe defaults and is a no-op before a connection is active', (t) => {
  t = tspl(t, { plan: 6 })

  const handler = new RetryHandler(baseOpts, {
    dispatch: () => {},
    handler: {}
  })

  // No dispatch has happened yet, so the proxy has no active connection to
  // forward to. Reads must fall back to safe defaults instead of throwing.
  const proxy = handler.controllerProxy
  t.strictEqual(proxy.paused, false)
  t.strictEqual(proxy.aborted, false)
  t.strictEqual(proxy.reason, null)
  t.strictEqual(proxy.rawHeaders, null)
  t.strictEqual(proxy.rawTrailers, null)

  // Methods must be inert (not throw) while there is nothing to forward to.
  t.doesNotThrow(() => {
    proxy.pause()
    proxy.resume()
    proxy.abort(new Error('ignored'))
  })
})

test('controller proxy forwards reads/writes to the active connection and stays stable across callbacks', (t) => {
  t = tspl(t, { plan: 9 })

  let downstreamController = null
  let upgradeController = null
  const upgradeArgs = []

  const handler = new RetryHandler(baseOpts, {
    dispatch: () => {},
    handler: {
      onRequestStart (controller) {
        downstreamController = controller
      },
      onRequestUpgrade (controller, statusCode, headers, socket) {
        upgradeController = controller
        upgradeArgs.push(statusCode, headers, socket)
      }
    }
  })

  const connection = activeConnectionController()

  // onRequestStart is the first callback of a dispatch; it re-points the proxy
  // at this connection's controller and hands the (stable) proxy downstream.
  handler.onRequestStart(connection, {})

  // The downstream handler must receive the proxy, never the raw per-connection
  // controller, so flow-control survives the next resume.
  t.notStrictEqual(downstreamController, connection)

  // Reads forward to the active connection's controller.
  t.deepStrictEqual(downstreamController.rawHeaders, ['content-length', '2'])
  t.deepStrictEqual(downstreamController.rawTrailers, ['x-trailer', 'value'])
  t.strictEqual(downstreamController.paused, true)
  t.strictEqual(downstreamController.aborted, true)
  t.strictEqual(downstreamController.reason, connection.reason)

  // Writes forward to the active connection's controller too.
  downstreamController.pause()
  downstreamController.resume()
  downstreamController.abort('stop')
  t.deepStrictEqual(connection.calls, ['pause', 'resume', ['abort', 'stop']])

  // An upgrade on the same dispatch is forwarded through the very same proxy
  // instance (not the raw controller), keeping the downstream wiring stable.
  handler.onRequestUpgrade(connection, 101, { upgrade: 'websocket' }, 'SOCKET')
  t.strictEqual(upgradeController, downstreamController)
  t.deepStrictEqual(upgradeArgs, [101, { upgrade: 'websocket' }, 'SOCKET'])
})

test('controller proxy is forwarded downstream on a 206 whose content-range is unparseable', (t) => {
  t = tspl(t, { plan: 3 })

  let startController = null
  const startArgs = []

  const handler = new RetryHandler(baseOpts, {
    dispatch: () => {},
    handler: {
      onResponseStart (controller, statusCode, headers) {
        startController = controller
        startArgs.push(statusCode, headers)
      }
    }
  })

  const connection = activeConnectionController()
  handler.onRequestStart(connection, {})

  // A 206 whose content-range cannot be parsed: the handler cannot set up a
  // resume, so it gives up and forwards the response downstream as-is -- still
  // through the proxy, not the raw per-connection controller.
  handler.onResponseStart(connection, 206, { 'content-range': 'invalid' }, 'Partial Content')

  t.strictEqual(startController, handler.controllerProxy)
  t.strictEqual(startArgs[0], 206)
  t.deepStrictEqual(startArgs[1], { 'content-range': 'invalid' })
})

test('controller proxy carries a synchronous dispatch failure to the downstream handler', (t) => {
  t = tspl(t, { plan: 2 })

  const dispatchError = new Error('dispatch failed synchronously')
  let errController = null
  let receivedErr = null

  const handler = new RetryHandler(baseOpts, {
    dispatch: () => { throw dispatchError },
    handler: {
      onResponseError (controller, err) {
        errController = controller
        receivedErr = err
      }
    }
  })

  const connection = activeConnectionController()
  handler.onRequestStart(connection, {})

  // retry() re-dispatches; when that dispatch throws synchronously the error is
  // surfaced to the downstream handler through the proxy.
  handler.retry()

  t.strictEqual(errController, handler.controllerProxy)
  t.strictEqual(receivedErr, dispatchError)
})
