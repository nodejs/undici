'use strict'

const { createServer } = require('node:http')
const { once } = require('node:events')
const { Agent, EventSource } = require('../..')
const { tspl } = require('@matteo.collina/tspl')
const { test } = require('node:test')

test('EventSource allows setting custom dispatcher.', async (t) => {
  const { completed, deepStrictEqual } = tspl(t, { plan: 1 })

  const server = createServer(async (req, res) => {
    res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
    deepStrictEqual(req.headers['x-customer-header'], 'hello world')

    res.end()
  }).listen(0)

  t.after(() => {
    server.close()
    eventSourceInstance.close()
  })

  await once(server, 'listening')

  class CustomHeaderAgent extends Agent {
    dispatch (opts) {
      opts.headers['x-customer-header'] = 'hello world'
      return super.dispatch(...arguments)
    }
  }

  const eventSourceInstance = new EventSource(`http://localhost:${server.address().port}`, {
    dispatcher: new CustomHeaderAgent()
  })

  await completed
})
