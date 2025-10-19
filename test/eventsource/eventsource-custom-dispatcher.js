'use strict'

const { createServer } = require('node:http')
const { Agent, EventSource } = require('../..')
const { test } = require('node:test')

test('EventSource allows setting custom dispatcher.', (t, done) => {
  t.plan(1)

  const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
    res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
    t.assert.deepStrictEqual(req.headers['x-customer-header'], 'hello world')

    res.end()
    done()
  })

  t.after(() => {
    server.close()
  })

  server.listen(0, () => {
    class CustomHeaderAgent extends Agent {
      dispatch (opts) {
        opts.headers['x-customer-header'] = 'hello world'
        return super.dispatch(...arguments)
      }
    }

    const eventSourceInstance = new EventSource(`http://localhost:${server.address().port}`, {
      dispatcher: new CustomHeaderAgent()
    })
    t.after(() => {
      eventSourceInstance.close()
    })
  })
})

test('EventSource allows setting custom dispatcher in EventSourceDict.', (t, done) => {
  t.plan(1)

  const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
    res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
    t.assert.deepStrictEqual(req.headers['x-customer-header'], 'hello world')

    res.end()

    done()
  })

  t.after(() => {
    server.close()
  })

  server.listen(0, () => {
    class CustomHeaderAgent extends Agent {
      dispatch (opts) {
        opts.headers['x-customer-header'] = 'hello world'
        return super.dispatch(...arguments)
      }
    }

    const eventSourceInstance = new EventSource(`http://localhost:${server.address().port}`, {
      node: {
        dispatcher: new CustomHeaderAgent()
      }
    })
    t.after(() => {
      eventSourceInstance.close()
    })
  })
})
