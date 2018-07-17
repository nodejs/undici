'use strict'

const t = require('tap')
const { Client } = require('..')
const { createServer } = require('http')
const { createHook, executionAsyncId } = require('async_hooks')

const transactions = new Map()

function getCurrentTransaction () {
  const asyncId = executionAsyncId()
  return transactions.has(asyncId) ? transactions.get(asyncId) : null
}

function setCurrentTransaction (trans) {
  const asyncId = executionAsyncId()
  transactions.set(asyncId, trans)
}

const hook = createHook({
  init (asyncId, type, triggerAsyncId, resource) {
    if (type === 'TIMERWRAP') return
    // process._rawDebug(type + ' ' + asyncId)
    transactions.set(asyncId, getCurrentTransaction())
  },
  destroy (asyncId) {
    transactions.delete(asyncId)
  }
})

hook.enable()

t.plan(8)

const server = createServer((req, res) => {
  res.setHeader('content-type', 'text/plain')
  res.end('hello')
})
t.tearDown(server.close.bind(server))

server.listen(0, () => {
  const client = new Client(`http://localhost:${server.address().port}`)
  t.tearDown(client.close.bind(client))

  client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
    t.error(err)
    body.resume()
    t.strictDeepEqual(getCurrentTransaction(), null)

    setCurrentTransaction({ hello: 'world2' })

    client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
      t.error(err)
      body.resume()
      t.strictDeepEqual(getCurrentTransaction(), { hello: 'world2' })
    })
  })

  client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
    t.error(err)
    body.resume()
    t.strictDeepEqual(getCurrentTransaction(), null)

    setCurrentTransaction({ hello: 'world' })

    client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
      t.error(err)
      body.resume()
      t.strictDeepEqual(getCurrentTransaction(), { hello: 'world' })
    })
  })
})
