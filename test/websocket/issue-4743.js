'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { setTimeout: delay } = require('node:timers/promises')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')

test('WebSocket serializes CONNECTING connections to the same host and port', async (t) => {
  const server = createServer()
  const wss = new WebSocketServer({ noServer: true })
  const upgrades = []
  const sockets = new Set()
  let firstConnectionOpen = false

  t.after(async () => {
    for (const socket of sockets) {
      socket.destroy()
    }

    await new Promise((resolve) => wss.close(resolve))
    await new Promise((resolve) => server.close(resolve))
  })

  server.on('upgrade', (req, socket, head) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))

    const upgrade = { req, socket, head, beforeFirstConnectionOpen: !firstConnectionOpen }
    upgrades.push(upgrade)

    server.emit('upgrade-recorded', upgrade)
  })

  server.listen(0)
  await once(server, 'listening')

  const first = new WebSocket(`ws://127.0.0.1:${server.address().port}`)
  t.after(() => {
    first.onerror = null
    first.close()
  })

  const [firstUpgrade] = await once(server, 'upgrade-recorded')
  const second = new WebSocket(`ws://127.0.0.1:${server.address().port}`)
  t.after(() => {
    second.onerror = null
    second.close()
  })

  await delay(100)
  t.assert.strictEqual(upgrades.length, 1)

  handleUpgrade(firstUpgrade)
  await once(first, 'open')
  firstConnectionOpen = true

  const [secondUpgrade] = await once(server, 'upgrade-recorded')
  t.assert.strictEqual(secondUpgrade.beforeFirstConnectionOpen, false)

  handleUpgrade(secondUpgrade)
  await once(second, 'open')

  first.close()
  second.close()

  function handleUpgrade ({ req, socket, head }) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.close()
    })
  }
})

test('closing a queued WebSocket does not unblock a later connection to the same host and port', async (t) => {
  const server = createServer()
  const wss = new WebSocketServer({ noServer: true })
  const upgrades = []
  const sockets = new Set()
  let firstConnectionOpen = false

  t.after(async () => {
    for (const socket of sockets) {
      socket.destroy()
    }

    await new Promise((resolve) => wss.close(resolve))
    await new Promise((resolve) => server.close(resolve))
  })

  server.on('upgrade', (req, socket, head) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))

    const upgrade = { req, socket, head, beforeFirstConnectionOpen: !firstConnectionOpen }
    upgrades.push(upgrade)

    server.emit('upgrade-recorded', upgrade)
  })

  server.listen(0)
  await once(server, 'listening')

  const first = new WebSocket(`ws://127.0.0.1:${server.address().port}`)
  t.after(() => {
    first.onerror = null
    first.close()
  })

  const [firstUpgrade] = await once(server, 'upgrade-recorded')
  const second = new WebSocket(`ws://127.0.0.1:${server.address().port}`)
  second.onerror = () => {}
  second.close()

  const third = new WebSocket(`ws://127.0.0.1:${server.address().port}`)
  t.after(() => {
    third.onerror = null
    third.close()
  })

  await delay(100)
  t.assert.strictEqual(upgrades.length, 1)

  handleUpgrade(firstUpgrade)
  await once(first, 'open')
  firstConnectionOpen = true

  const [thirdUpgrade] = await once(server, 'upgrade-recorded')
  t.assert.strictEqual(thirdUpgrade.beforeFirstConnectionOpen, false)

  handleUpgrade(thirdUpgrade)
  await once(third, 'open')

  first.close()
  third.close()

  function handleUpgrade ({ req, socket, head }) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.close()
    })
  }
})
