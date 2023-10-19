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
