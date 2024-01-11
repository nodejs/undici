'use strict'

const { test } = require('tap')
const { Client } = require('..')
const net = require('net')

// TODO: move to test/node-test/client-connect.js
test('parser error', (t) => {
  t.plan(2)

  const server = net.createServer()
  server.once('connection', (socket) => {
    socket.write('asd\n\r213123')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err) => {
      t.ok(err)
      client.close((err) => {
        t.error(err)
      })
    })
  })
})
