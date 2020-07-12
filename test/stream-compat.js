'use strict'

const { test } = require('tap')
const { Client } = require('..')
const { createServer } = require('http')
const EE = require('events')

test('stream body without destroy', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.end()
  })
  t.teardown(server.close.bind(server))
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    const signal = new EE()
    const body = new EE()
    body.on('error', (err) => {
      t.ok(err)
    })
    client.request({
      path: '/',
      method: 'PUT',
      signal,
      body
    }, (err, data) => {
      t.ok(err)
    })
    signal.emit('abort')
  })
})
