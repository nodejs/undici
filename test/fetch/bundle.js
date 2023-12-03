'use strict'

const { test } = require('tap')

const { Response, Request, FormData, Headers } = require('../../undici-fetch')

test('bundle sets constructor.name and .name properly', (t) => {
  t.equal(new Response().constructor.name, 'Response')
  t.equal(Response.name, 'Response')

  t.equal(new Request('http://a').constructor.name, 'Request')
  t.equal(Request.name, 'Request')

  t.equal(new Headers().constructor.name, 'Headers')
  t.equal(Headers.name, 'Headers')

  t.equal(new FormData().constructor.name, 'FormData')
  t.equal(FormData.name, 'FormData')

  t.end()
})

test('regression test for https://github.com/nodejs/node/issues/50263', (t) => {
  const request = new Request('https://a', {
    headers: {
      test: 'abc'
    },
    method: 'POST'
  })

  const request1 = new Request(request, { body: 'does not matter' })

  t.equal(request1.headers.get('test'), 'abc')
  t.end()
})
