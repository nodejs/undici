'use strict'

const undici = require('../..')
const { test } = require('node:test')
const assert = require('node:assert')
const { inspect } = require('node:util')

test('spreading web classes yields empty objects', (t) => {
  for (const object of [
    new undici.FormData(),
    new undici.Response(null),
    new undici.Request('http://a')
  ]) {
    assert.deepStrictEqual({ ...object }, {})
  }
})

test('Objects only have an expected set of symbols on their prototypes', (t) => {
  const allowedSymbols = [
    Symbol.iterator,
    Symbol.toStringTag,
    inspect.custom
  ]

  for (const object of [
    undici.FormData,
    undici.Response,
    undici.Request,
    undici.Headers,
    undici.WebSocket,
    undici.MessageEvent,
    undici.CloseEvent,
    undici.ErrorEvent,
    undici.EventSource
  ]) {
    const symbols = Object.keys(Object.getOwnPropertyDescriptors(object.prototype))
      .filter(v => typeof v === 'symbol')

    assert(symbols.every(symbol => allowedSymbols.includes(symbol)))
  }
})
