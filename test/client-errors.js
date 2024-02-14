'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { Client } = require('..')
const net = require('node:net')

// TODO: move to test/node-test/client-connect.js
test('parser error', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = net.createServer()
  server.once('connection', (socket) => {
    socket.write('asd\n\r213123')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

    client.request({ path: '/', method: 'GET' }, (err) => {
      t.ok(err)
      client.close((err) => {
        t.ifError(err)
      })
    })
  })

  await t.completed
})
