'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const { Response, Request, FormData, Headers, MessageEvent, CloseEvent, ErrorEvent } = require('../../undici-fetch')

test('bundle sets constructor.name and .name properly', () => {
  assert.strictEqual(new Response().constructor.name, 'Response')
  assert.strictEqual(Response.name, 'Response')

  assert.strictEqual(new Request('http://a').constructor.name, 'Request')
  assert.strictEqual(Request.name, 'Request')

  assert.strictEqual(new Headers().constructor.name, 'Headers')
  assert.strictEqual(Headers.name, 'Headers')

  assert.strictEqual(new FormData().constructor.name, 'FormData')
  assert.strictEqual(FormData.name, 'FormData')
})

test('regression test for https://github.com/nodejs/node/issues/50263', () => {
  const request = new Request('https://a', {
    headers: {
      test: 'abc'
    },
    method: 'POST'
  })

  const request1 = new Request(request, { body: 'does not matter' })

  assert.strictEqual(request1.headers.get('test'), 'abc')
})

test('WebSocket related events are exported', (t) => {
  assert.deepStrictEqual(typeof CloseEvent, 'function')
  assert.deepStrictEqual(typeof MessageEvent, 'function')
  assert.deepStrictEqual(typeof ErrorEvent, 'function')
})
