'use strict'

const { test } = require('node:test')
const { createServer, request, Agent } = require('node:http')
const { once } = require('node:events')
const { setImmediate, setTimeout } = require('node:timers/promises')
const { Request, Response } = require('../..')

// https://github.com/nodejs/undici/issues/5988
for (const Body of [Request, Response]) {
  test(`${Body.name} does not pull an async iterable before reading its body`, async (t) => {
    let pulls = 0
    const iterable = {
      async * [Symbol.asyncIterator] () {
        pulls++
        yield ''
        yield 'hello'
        yield new Uint8Array([32, 119, 111, 114, 108, 100])
      }
    }
    const body = Body === Request
      ? new Request('http://localhost/', { method: 'PUT', body: iterable, duplex: 'half' })
      : new Response(iterable)

    await setImmediate()
    t.assert.strictEqual(pulls, 0)
    t.assert.strictEqual(await body.text(), 'hello world')
    t.assert.strictEqual(pulls, 1)
  })
}

test('cancelling an async iterable body closes its iterator', async (t) => {
  let closed = false
  const reason = new Error('cancelled')
  const iterable = {
    [Symbol.asyncIterator] () {
      return {
        async next () {
          return { done: false, value: 'hello' }
        },
        async return () {
          closed = true
          return { done: true }
        }
      }
    }
  }
  const reader = new Response(iterable).body.getReader()
  t.assert.deepStrictEqual(await reader.read(), { done: false, value: Buffer.from('hello') })
  await reader.cancel(reason)
  t.assert.strictEqual(closed, true)
})

test('an unread Request body leaves an IncomingMessage keep-alive socket usable', { timeout: 10000 }, async (t) => {
  const sockets = new Set()
  const server = createServer((req, res) => {
    sockets.add(req.socket)
    // As in Next.js, wrap the IncomingMessage but respond without reading it.
    const body = new Request(`http://localhost${req.url}`, {
      method: req.method,
      body: req,
      duplex: 'half'
    })
    setTimeout(50).then(() => {
      t.assert.strictEqual(body.bodyUsed, false)
      res.writeHead(413).end()
    })
  })
  const agent = new Agent({ keepAlive: true, maxSockets: 1 })
  t.after(() => {
    agent.destroy()
    server.closeAllConnections()
    server.close()
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')

  const put = (bytes) => new Promise((resolve, reject) => {
    const req = request({
      port: server.address().port,
      host: '127.0.0.1',
      method: 'PUT',
      agent,
      timeout: 3000
    }, (res) => {
      res.resume().on('end', () => resolve(res.statusCode))
    })
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error('request timed out')))
    req.end(Buffer.alloc(bytes))
  })

  t.assert.strictEqual(await put(1024 * 1024), 413)
  t.assert.strictEqual(await put(16), 413)
  t.assert.strictEqual(sockets.size, 1)
})
