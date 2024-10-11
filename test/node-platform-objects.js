'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test } = require('node:test')
const { markAsUncloneable } = require('node:worker_threads')
const { Response, Request, FormData, Headers, ErrorEvent, MessageEvent, CloseEvent, EventSource, WebSocket } = require('..')
const { CacheStorage } = require('../lib/web/cache/cachestorage')
const { Cache } = require('../lib/web/cache/cache')
const { kConstruct } = require('../lib/core/symbols')

test('unserializable web instances should be uncloneable if node exposes the api', (t) => {
  if (markAsUncloneable !== undefined) {
    t = tspl(t, { plan: 11 })
    const uncloneables = [
      { Uncloneable: Response, brand: 'Response' },
      { Uncloneable: Request, value: 'http://localhost', brand: 'Request' },
      { Uncloneable: FormData, brand: 'FormData' },
      { Uncloneable: MessageEvent, value: 'dummy event', brand: 'MessageEvent' },
      { Uncloneable: CloseEvent, value: 'dummy event', brand: 'CloseEvent' },
      { Uncloneable: ErrorEvent, value: 'dummy event', brand: 'ErrorEvent' },
      { Uncloneable: EventSource, value: 'http://localhost', brand: 'EventSource' },
      { Uncloneable: Headers, brand: 'Headers' },
      { Uncloneable: WebSocket, value: 'http://localhost', brand: 'WebSocket' },
      { Uncloneable: Cache, value: kConstruct, brand: 'Cache' },
      { Uncloneable: CacheStorage, value: kConstruct, brand: 'CacheStorage' }
    ]
    uncloneables.forEach((platformEntity) => {
      t.throws(() => structuredClone(new platformEntity.Uncloneable(platformEntity.value)),
        DOMException,
        `Cloning ${platformEntity.brand} should throw DOMException`)
    })
  }
})
