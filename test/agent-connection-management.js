'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { request, fetch, Agent } = require('..')

// Closes every socket with `Connection: close` after `requestsPerSocket`
// requests and records how many requests each socket served.
async function startClosingServer (t, requestsPerSocket) {
  let nextSocketId = 0
  const socketIds = new Map()
  const servedPerSocket = []

  const server = createServer((req, res) => {
    const socket = req.socket
    if (!socketIds.has(socket)) {
      socketIds.set(socket, nextSocketId++)
      servedPerSocket.push(0)
    }

    const id = socketIds.get(socket)
    servedPerSocket[id] += 1
    res.setHeader('x-socket-id', String(id))
    if (servedPerSocket[id] >= requestsPerSocket) {
      res.setHeader('connection', 'close')
    }
    res.end('ok')
  })

  server.listen(0)
  await once(server, 'listening')

  t.after(() => {
    server.closeAllConnections?.()
    server.close()
  })

  return { origin: `http://localhost:${server.address().port}`, servedPerSocket }
}

// https://github.com/nodejs/undici/issues/5022
// https://github.com/nodejs/undici/issues/5910
describe('Agent should not close active clients', () => {
  test('request() reuses the replacement connection after the server closes the previous one', async (t) => {
    const { origin, servedPerSocket } = await startClosingServer(t, 3)

    const agent = new Agent({ connections: 1 })
    t.after(() => agent.close())

    for (let i = 0; i < 12; i++) {
      const { statusCode, body } = await request(origin, { dispatcher: agent })
      assert.strictEqual(statusCode, 200)
      await body.dump()
    }

    assert.deepStrictEqual(servedPerSocket, [3, 3, 3, 3])
  })

  test('fetch() reuses the replacement connection after the server closes the previous one', async (t) => {
    const { origin, servedPerSocket } = await startClosingServer(t, 3)

    const agent = new Agent()
    t.after(() => agent.close())

    for (let i = 0; i < 12; i++) {
      const res = await fetch(origin, { dispatcher: agent })
      assert.strictEqual(res.status, 200)
      await res.text()
    }

    assert.deepStrictEqual(servedPerSocket, [3, 3, 3, 3])
  })
})
