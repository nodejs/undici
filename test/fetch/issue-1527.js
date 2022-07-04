'use strict'

const { test } = require('tap')

const undici = require('../..')

test("Allows you to use 'Request' object created before", async (t) => {
  const body = JSON.stringify({ foo: 'bar' })
  const request = new undici.Request('https://www.google.com', {
    method: 'POST',
    body
  })

  await undici.fetch(request)

  t.end()
})
