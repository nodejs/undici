'use strict'

const { test } = require('node:test')
const diagnosticsChannel = require('node:diagnostics_channel')
const { Client } = require('../../..')

test('Diagnostics channel - connect error', (t) => {
  const connectError = new Error('custom error')
  t.plan(16)

  let _connector
  diagnosticsChannel.channel('undici:client:beforeConnect').subscribe(({ connectParams, connector }) => {
    _connector = connector

    t.assert.strictEqual(typeof _connector, 'function')
    t.assert.strictEqual(Object.keys(connectParams).length, 7)

    const { host, hostname, protocol, port, servername } = connectParams

    t.assert.strictEqual(host, 'localhost:1234')
    t.assert.strictEqual(hostname, 'localhost')
    t.assert.strictEqual(port, '1234')
    t.assert.strictEqual(protocol, 'http:')
    t.assert.strictEqual(servername, null)
  })

  diagnosticsChannel.channel('undici:client:connectError').subscribe(({ error, connectParams, connector }) => {
    t.assert.strictEqual(Object.keys(connectParams).length, 7)
    t.assert.strictEqual(_connector, connector)

    const { host, hostname, protocol, port, servername } = connectParams

    t.assert.strictEqual(error, connectError)
    t.assert.strictEqual(host, 'localhost:1234')
    t.assert.strictEqual(hostname, 'localhost')
    t.assert.strictEqual(port, '1234')
    t.assert.strictEqual(protocol, 'http:')
    t.assert.strictEqual(servername, null)
  })

  const client = new Client('http://localhost:1234', {
    connect: (_, cb) => { cb(connectError, null) }
  })

  return new Promise((resolve) => {
    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.assert.strictEqual(err, connectError)
      client.close()
      resolve()
    })
  })
})
