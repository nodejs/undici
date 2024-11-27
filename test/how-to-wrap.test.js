'use strict'

// This loads the global dispatcher from Node.js core
fetch('http://example.com').catch()

const { test } = require('node:test')
const assert = require('node:assert')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { interceptors, getGlobalDispatcher, setGlobalDispatcher } = require('../index.js')

test('how to wrap', async (t) => {
  let first = true
  const server = createServer((req, res) => {
    if (first) {
      res.statusCode = 500
      res.end('error')
      first = false
    } else {
      res.end('Hello World')
    }
  })

  server.listen(3000)
  t.after(() => server.close())

  await once(server, 'listening')

  setGlobalDispatcher(getGlobalDispatcher().compose((dispatch) => {
    return function Intercept (opts, handler) {
      // How to implement an interceptor that works in this case?
      // should we call WrapHandler.wrap() here?
      handler.onRequestStart()
    }
  }))

  const response = await fetch('http://localhost:3000')
  const text = await response.text()

  assert.strictEqual(text, 'Hello World')
})
