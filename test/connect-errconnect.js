'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { Client } = require('..')
const net = require('node:net')

test('connect-connectionError', async t => {
  t = tspl(t, { plan: 2 })

  const client = new Client('http://localhost:9000')
  after(() => client.close())

  client.once('connectionError', () => {
    t.ok(true, 'pass')
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

  await t.completed
})
