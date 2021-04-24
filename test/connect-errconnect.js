'use strict'

const { test } = require('tap')
const { Client } = require('..')
const net = require('net')

test('connect-errconnect', t => {
  t.plan(2)

  const client = new Client('http://localhost:9000')
  t.teardown(client.close.bind(client))

  client.once('errconnect', () => {
    t.pass()
  })

  const _err = new Error('kaboom')
  net.connect = function (options) {
    const socket = new net.Socket(options)
    setImmediate(() => {
      socket.destroy(_err)
    })
    return socket
  }

  client.request({
    path: '/',
    method: 'GET'
  }, (err) => {
    t.strictEqual(err, _err)
  })
})
