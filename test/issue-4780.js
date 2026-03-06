'use strict'

const { strictEqual } = require('node:assert')
const { test } = require('node:test')
const { Dispatcher } = require('..')
const DispatcherBase = require('../lib/dispatcher/dispatcher-base')

function createController () {
  return {
    abort () {},
    pause () {},
    resume () {}
  }
}

class NewAPIDispatcher extends Dispatcher {
  dispatch (opts, handler) {
    const controller = createController()

    handler.onRequestStart?.(controller, {})
    handler.onResponseStart?.(controller, 200, { 'content-type': 'text/plain' }, 'OK')
    handler.onResponseData?.(controller, Buffer.from('Hello, world!'))
    handler.onResponseEnd?.(controller, {})

    return true
  }

  close () {}

  destroy () {}
}

class NewAPIDispatcherBase extends DispatcherBase {
  dispatch (opts, handler) {
    const controller = createController()

    handler.onRequestStart?.(controller, {})
    handler.onResponseStart?.(controller, 200, { 'content-type': 'text/plain' }, 'OK')
    handler.onResponseData?.(controller, Buffer.from('Hello, world!'))
    handler.onResponseEnd?.(controller, {})

    return true
  }
}

async function assertRequestSucceeds (dispatcher) {
  const response = await dispatcher.request({
    origin: 'http://example.com',
    path: '/',
    method: 'GET'
  })

  strictEqual(await response.body.text(), 'Hello, world!')
}

test('https://github.com/nodejs/undici/issues/4780 - request uses new handler API (Dispatcher)', async () => {
  await assertRequestSucceeds(new NewAPIDispatcher())
})

test('https://github.com/nodejs/undici/issues/4780 - request uses new handler API (DispatcherBase)', async () => {
  await assertRequestSucceeds(new NewAPIDispatcherBase())
})
