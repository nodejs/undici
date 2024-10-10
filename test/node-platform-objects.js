'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test } = require('node:test')
const { markAsUncloneable } = require('node:worker_threads')
const { Response, Request, FormData, Headers, MessageEvent, CloseEvent, EventSource, WebSocket } = require('..')

test('undici instances should be uncloneable if node exposes api', async (t) => {
  if (markAsUncloneable !== undefined) {
    t = tspl(t, { plan: 8 })
    const uncloneables = [
      { Uncloneable: Response, brand: 'Response' },
      { Uncloneable: Request, value: 'http://localhost', brand: 'Request' },
      { Uncloneable: FormData, brand: 'FormData' },
      { Uncloneable: MessageEvent, value: 'message', brand: 'MessageEvent' },
      { Uncloneable: CloseEvent, value: 'dummy type', brand: 'CloseEvent' },
      { Uncloneable: EventSource, value: 'http://localhost', brand: 'EventSource' },
      { Uncloneable: Headers, brand: 'Headers' },
      { Uncloneable: WebSocket, value: 'http://localhost', brand: 'WebSocket' }
    ]
    uncloneables.forEach((platformEntity) => {
      t.throws(() => structuredClone(new platformEntity.Uncloneable(platformEntity.value)),
        DOMException,
        `Cloning ${platformEntity.brand} should throw DOMException`)
    })
  }
})
