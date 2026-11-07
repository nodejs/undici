'use strict'

const assert = require('node:assert')
const { once } = require('node:events')
const { createServer } = require('node:net')
const { test } = require('node:test')
const { Agent, Client, fetch, getGlobalDispatcher, setGlobalDispatcher } = require('..')

for (const [name, whitespace] of [['space', ' '], ['spaces', '         ']]) {
  for (const api of ['fetch', 'request']) {
    test(`${api} accepts Content-Length with trailing ${name}`, async (t) => {
      const server = createServer(socket => {
        socket.once('data', () => {
          socket.end(`HTTP/1.1 200 OK\r\nContent-Length: 5${whitespace}\r\nConnection: close\r\n\r\nhello`)
        })
      })
      t.after(() => new Promise(resolve => server.close(resolve)))
      server.listen(0, '127.0.0.1')
      await once(server, 'listening')

      const url = `http://127.0.0.1:${server.address().port}`
      if (api === 'fetch') {
        const previousDispatcher = getGlobalDispatcher()
        const agent = new Agent()
        setGlobalDispatcher(agent)
        t.after(async () => {
          setGlobalDispatcher(previousDispatcher)
          await agent.close()
        })

        const response = await fetch(url)
        assert.strictEqual(await response.text(), 'hello')
      } else {
        const client = new Client(url)
        t.after(() => client.close())

        const { body } = await client.request({ path: '/', method: 'GET' })
        assert.strictEqual(await body.text(), 'hello')
      }
    })
  }
}
