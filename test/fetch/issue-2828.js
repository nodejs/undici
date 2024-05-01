'use strict'

const { once } = require('node:events')
const { createServer } = require('node:http')
const { test } = require('node:test')
const { Agent, Request, fetch } = require('../..')
const { tspl } = require('@matteo.collina/tspl')

test('issue #2828, dispatcher is allowed in RequestInit options', async (t) => {
  const { deepStrictEqual } = tspl(t, { plan: 1 })

  class CustomAgent extends Agent {
    dispatch (options, handler) {
      options.headers['x-my-header'] = 'hello'
      return super.dispatch(...arguments)
    }
  }

  const server = createServer((req, res) => {
    deepStrictEqual(req.headers['x-my-header'], 'hello')
    res.end()
  }).listen(0)

  t.after(server.close.bind(server))
  await once(server, 'listening')

  const request = new Request(`http://localhost:${server.address().port}`, {
    dispatcher: new CustomAgent()
  })

  await fetch(request)
})
