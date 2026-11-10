'use strict'

const assert = require('node:assert/strict')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { test } = require('node:test')
const { Agent, fetch, request } = require('..')

// https://github.com/nodejs/undici/issues/5910
for (const [name, send] of Object.entries({ fetch, request })) {
  for (const connections of [undefined, 1]) {
    test(`${name} reuses ${connections === 1 ? 'Client' : 'Pool'} connections after Connection: close`, { timeout: 10000 }, async (t) => {
      const requestsPerSocket = new Map()
      const server = createServer((req, res) => {
        const count = (requestsPerSocket.get(req.socket) || 0) + 1
        requestsPerSocket.set(req.socket, count)
        if (count === 3) {
          res.setHeader('connection', 'close')
        }
        res.end('ok')
      })
      t.after(() => {
        server.closeAllConnections()
        server.close()
      })

      await once(server.listen(0, '127.0.0.1'), 'listening')

      const agent = new Agent({ connections })
      t.after(() => agent.destroy())
      const url = `http://127.0.0.1:${server.address().port}`

      for (let i = 0; i < 30; i++) {
        const response = await send(url, { dispatcher: agent })
        const body = name === 'fetch' ? response : response.body
        assert.strictEqual(await body.text(), 'ok')
      }

      assert.deepStrictEqual([...requestsPerSocket.values()], Array(10).fill(3))
    })
  }
}
