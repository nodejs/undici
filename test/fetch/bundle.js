'use strict'

const { test } = require('node:test')

const { Response, Request, FormData, Headers, MessageEvent, CloseEvent, ErrorEvent } = require('../../undici-fetch')

test('bundle sets constructor.name and .name properly', (t) => {
  t.assert.strictEqual(new Response().constructor.name, 'Response')
  t.assert.strictEqual(Response.name, 'Response')

  t.assert.strictEqual(new Request('http://a').constructor.name, 'Request')
  t.assert.strictEqual(Request.name, 'Request')

  t.assert.strictEqual(new Headers().constructor.name, 'Headers')
  t.assert.strictEqual(Headers.name, 'Headers')

  t.assert.strictEqual(new FormData().constructor.name, 'FormData')
  t.assert.strictEqual(FormData.name, 'FormData')
})

test('regression test for https://github.com/nodejs/node/issues/50263', (t) => {
  const request = new Request('https://a', {
    headers: {
      test: 'abc'
    },
    method: 'POST'
  })

  const request1 = new Request(request, { body: 'does not matter' })

  t.assert.strictEqual(request1.headers.get('test'), 'abc')
})

test('WebSocket related events are exported', (t) => {
  t.assert.deepStrictEqual(typeof CloseEvent, 'function')
  t.assert.deepStrictEqual(typeof MessageEvent, 'function')
  t.assert.deepStrictEqual(typeof ErrorEvent, 'function')
})
