'use strict'

const assert = require('node:assert')
const { Duplex } = require('node:stream')
const { test } = require('node:test')
const FakeTimers = require('@sinonjs/fake-timers')
const Socks5ProxyAgent = require('../lib/dispatcher/socks5-proxy-agent')

function createSocket ({ authenticate = false } = {}) {
  let handshake = true
  const socket = new Duplex({
    read () {},
    write (_chunk, _encoding, callback) {
      callback()

      if (authenticate && handshake) {
        handshake = false
        queueMicrotask(() => socket.push(Buffer.from([0x05, 0x00])))
      }
    }
  })

  return socket
}

function createAgent (socket) {
  return new Socks5ProxyAgent('socks5://localhost:1080', {
    connect (_options, callback) {
      callback(null, socket)
    }
  })
}

async function advanceToTimeout (clock) {
  for (let attempt = 0; attempt < 10 && clock.countTimers() === 0; attempt++) {
    await Promise.resolve()
  }

  assert.strictEqual(clock.countTimers(), 1)
  await clock.tickAsync(5000)
}

test('SOCKS5 authentication timeout destroys the socket', async (t) => {
  const clock = FakeTimers.install({ toFake: ['setTimeout', 'clearTimeout'] })
  const socket = createSocket()
  const agent = createAgent(socket)

  t.after(() => clock.uninstall())
  t.after(() => socket.destroy())
  t.after(() => agent.destroy())

  const connection = agent.createSocks5Connection('example.com', 80)
  const rejected = assert.rejects(connection, /SOCKS5 authentication timeout/)
  await advanceToTimeout(clock)

  await rejected
  assert.strictEqual(socket.destroyed, true)
})

test('SOCKS5 connection timeout destroys the socket', async (t) => {
  const clock = FakeTimers.install({ toFake: ['setTimeout', 'clearTimeout'] })
  const socket = createSocket({ authenticate: true })
  const agent = createAgent(socket)

  t.after(() => clock.uninstall())
  t.after(() => socket.destroy())
  t.after(() => agent.destroy())

  const connection = agent.createSocks5Connection('example.com', 80)
  const rejected = assert.rejects(connection, /SOCKS5 connection timeout/)
  await advanceToTimeout(clock)

  await rejected
  assert.strictEqual(socket.destroyed, true)
})
