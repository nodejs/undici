'use strict'

const { once } = require('node:events')
const { createServer } = require('node:http')
const { test } = require('node:test')
const { Agent, Request, fetch } = require('../..')

test('issue #2828, RequestInit dispatcher options overrides Request input dispatcher', async (t) => {
  t.plan(2)

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

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.strictEqual(req.headers['x-my-header-a'], undefined)
    t.assert.strictEqual(req.headers['x-my-header-b'], 'world')
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
