'use strict'

const { test } = require('node:test')
const { tspl } = require('@matteo.collina/tspl')
const diagnosticsChannel = require('node:diagnostics_channel')
const { Client } = require('../../..')

test('Diagnostics channel - connect error', (t) => {
  const connectError = new Error('custom error')
  const assert = tspl(t, { plan: 16 })

  let _connector
  diagnosticsChannel.channel('undici:client:beforeConnect').subscribe(({ connectParams, connector }) => {
    _connector = connector

    assert.equal(typeof _connector, 'function')
    assert.equal(Object.keys(connectParams).length, 7)

    const { host, hostname, protocol, port, servername } = connectParams

    assert.equal(host, 'localhost:1234')
    assert.equal(hostname, 'localhost')
    assert.equal(port, '1234')
    assert.equal(protocol, 'http:')
    assert.equal(servername, null)
  })

  diagnosticsChannel.channel('undici:client:connectError').subscribe(({ error, connectParams, connector }) => {
    assert.equal(Object.keys(connectParams).length, 7)
    assert.equal(_connector, connector)

    const { host, hostname, protocol, port, servername } = connectParams

    assert.equal(error, connectError)
    assert.equal(host, 'localhost:1234')
    assert.equal(hostname, 'localhost')
    assert.equal(port, '1234')
    assert.equal(protocol, 'http:')
    assert.equal(servername, null)
  })

  const client = new Client('http://localhost:1234', {
    connect: (_, cb) => { cb(connectError, null) }
  })

  return new Promise((resolve) => {
    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      assert.equal(err, connectError)
      client.close()
      resolve()
    })
  })
})
