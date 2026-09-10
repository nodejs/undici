'use strict'

const { test } = require('node:test')
const { Client } = require('..')
const { H1Parser } = require('../lib/dispatcher/parser-h1')
const { kParser, kUseMilo } = require('../lib/core/symbols')

function createSocket () {
  const socket = {
    destroyed: false,
    errored: null,
    readable: true,
    readableLength: 0,
    on () { return this },
    once () { return this },
    removeListener () { return this },
    unshift () {}
  }

  return socket
}

test('uses Milo when enabled on a Client', async (t) => {
  const client = new Client('http://localhost:1', { useMilo: true })
  const socket = createSocket()

  const connectH1 = require('../lib/dispatcher/client-h1')
  connectH1(client, socket)

  t.assert.strictEqual(client[kUseMilo], true)
  t.assert.ok(socket[kParser] instanceof H1Parser)
  socket[kParser].destroy()
})

test('allows disabling Milo explicitly', async (t) => {
  const client = new Client('http://localhost:1', { useMilo: false })
  const socket = createSocket()

  const connectH1 = require('../lib/dispatcher/client-h1')
  connectH1(client, socket)

  t.assert.strictEqual(client[kUseMilo], false)
  t.assert.ok(!(socket[kParser] instanceof H1Parser))
  socket[kParser].destroy()
})
