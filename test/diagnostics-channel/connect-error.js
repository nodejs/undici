'use strict'

const t = require('tap')

let diagnosticsChannel

try {
  diagnosticsChannel = require('diagnostics_channel')
} catch {
  t.skip('missing diagnostics_channel')
  process.exit(0)
}

const { Client } = require('../..')

t.plan(14)

const connectError = new Error('custom error')

diagnosticsChannel.channel('undici:client:connect').subscribe((connectParams) => {
  t.equal(Object.keys(connectParams).length, 5)

  const { host, hostname, protocol, port, servername } = connectParams

  t.equal(host, 'localhost:1234')
  t.equal(hostname, 'localhost')
  t.equal(port, '1234')
  t.equal(protocol, 'http:')
  t.equal(servername, null)
})

diagnosticsChannel.channel('undici:client:connect:error').subscribe(({ error, ...connectParams }) => {
  t.equal(Object.keys(connectParams).length, 5)

  const { host, hostname, protocol, port, servername } = connectParams

  t.equal(error, connectError)
  t.equal(host, 'localhost:1234')
  t.equal(hostname, 'localhost')
  t.equal(port, '1234')
  t.equal(protocol, 'http:')
  t.equal(servername, null)
})

const client = new Client('http://localhost:1234', {
  connect: (_, cb) => { cb(connectError, null) }
})

t.teardown(client.close.bind(client))

client.request({
  path: '/',
  method: 'GET'
}, (err, data) => {
  t.equal(err, connectError)
})
