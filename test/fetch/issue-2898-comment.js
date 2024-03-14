'use strict'

const { once } = require('node:events')
const { createServer } = require('node:http')
const { test } = require('node:test')
const { Agent, Request, fetch } = require('../..')
const { tspl } = require('@matteo.collina/tspl')

test('issue #2828, RequestInit dispatcher options overrides Request input dispatcher', async (t) => {
  const { strictEqual } = tspl(t, { plan: 2 })

  class CustomAgentA extends Agent {
    dispatch (options, handler) {
      options.headers['x-my-header-a'] = 'hello'
      return super.dispatch(...arguments)
    }
  }

  class CustomAgentB extends Agent {
    dispatch (options, handler) {
      options.headers['x-my-header-b'] = 'world'
      return super.dispatch(...arguments)
    }
  }

  const server = createServer((req, res) => {
    strictEqual(req.headers['x-my-header-a'], undefined)
    strictEqual(req.headers['x-my-header-b'], 'world')
    res.end()
  }).listen(0)

  t.after(server.close.bind(server))
  await once(server, 'listening')

  const request = new Request(`http://localhost:${server.address().port}`, {
    dispatcher: new CustomAgentA()
  })

  await fetch(request, {
    dispatcher: new CustomAgentB()
  })
})
