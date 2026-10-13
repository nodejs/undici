const { test, describe } = require('node:test')
const assert = require('node:assert')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { request, Agent, Pool, ProxyAgent } = require('..')
const { kClients } = require('../lib/core/symbols')

// https://github.com/nodejs/undici/issues/4424
describe('Agent should close inactive clients', () => {
  test('without active connections', async (t) => {
    const server = createServer({ keepAliveTimeout: 0 }, async (_req, res) => {
      res.setHeader('connection', 'close')
      res.writeHead(200)
      res.end('ok')
    }).listen(0)

    t.after(() => {
      server.closeAllConnections?.()
      server.close()
    })

    /** @type {Promise<void>} */
    let p
    const agent = new Agent({
      factory: (origin, opts) => {
        const pool = new Pool(origin, opts)
        const { promise, resolve, reject } = Promise.withResolvers()
        p = promise
        pool.on('disconnect', () => {
          setImmediate(() => pool.destroyed ? resolve() : reject(new Error('client not destroyed')))
        })
        return pool
      }
    })
    const { statusCode } = await request(`http://localhost:${server.address().port}`, { dispatcher: agent })
    assert.equal(statusCode, 200)

    await p
  })

  test('in case of connection error', async (t) => {
    /** @type {Promise<void>} */
    let p
    const agent = new Agent({
      factory: (origin, opts) => {
        const pool = new Pool(origin, opts)
        const { promise, resolve, reject } = Promise.withResolvers()
        p = promise
        pool.on('connectionError', () => {
          setImmediate(() => pool.destroyed ? resolve() : reject(new Error('client not destroyed')))
        })
        return pool
      }
    })
    try {
      await request('http://localhost:0', { dispatcher: agent })
    } catch (_) {
      // ignore
    }

    await p
  })
})

// https://github.com/nodejs/undici/issues/5022
describe('Agent should not close active clients', () => {
  test('should reuse replacement keep-alive connection after server closes the previous one', async (t) => {
    let nextSocketId = 0
    const socketIds = new Map()
    const requestsPerSocket = new Map()

    const server = createServer((req, res) => {
      const socket = req.socket
      if (!socketIds.has(socket)) {
        socketIds.set(socket, ++nextSocketId)
      }

      const count = (requestsPerSocket.get(socket) || 0) + 1
      requestsPerSocket.set(socket, count)

      const remaining = 3 - count
      res.setHeader('x-socket-id', String(socketIds.get(socket)))

      if (remaining > 0) {
        res.setHeader('connection', 'Keep-Alive')
        res.setHeader('keep-alive', `timeout=30, max=${remaining}`)
      } else {
        res.setHeader('connection', 'close')
      }

      res.writeHead(200)
      res.end('ok')
    }).listen(0)

    t.after(() => {
      server.closeAllConnections?.()
      server.close()
    })

    const agent = new Agent({ connections: 1 })
    t.after(() => agent.close())

    const socketSequence = []
    for (let i = 0; i < 5; i++) {
      const { statusCode, headers, body } = await request(`http://localhost:${server.address().port}`, {
        dispatcher: agent
      })

      assert.equal(statusCode, 200)
      await body.dump()
      socketSequence.push(headers['x-socket-id'])
    }

    assert.deepEqual(socketSequence.slice(0, 3), ['1', '1', '1'])
    assert.deepEqual(socketSequence.slice(3), ['2', '2'])
  })

  test('should reuse replacement connection after keep-alive max closes the previous one', async (t) => {
    let nextSocketId = 0
    const socketIds = new Map()

    const server = createServer((req, res) => {
      const socket = req.socket
      if (!socketIds.has(socket)) {
        socketIds.set(socket, ++nextSocketId)
      }

      res.setHeader('x-socket-id', String(socketIds.get(socket)))
      res.setHeader('connection', 'Keep-Alive')
      res.setHeader('keep-alive', 'timeout=30')

      res.writeHead(200)
      res.end('ok')
    }).listen(0)

    t.after(() => {
      server.closeAllConnections?.()
      server.close()
    })

    const agent = new Agent({ connections: 1, maxRequestsPerClient: 3 })
    t.after(() => agent.close())

    const socketSequence = []
    for (let i = 0; i < 5; i++) {
      const { statusCode, headers, body } = await request(`http://localhost:${server.address().port}`, {
        dispatcher: agent
      })

      assert.equal(statusCode, 200)
      await body.dump()
      socketSequence.push(headers['x-socket-id'])
    }

    assert.deepEqual(socketSequence.slice(0, 3), ['1', '1', '1'])
    assert.deepEqual(socketSequence.slice(3), ['2', '2'])
  })
})

// https://github.com/nodejs/undici/issues/5529
describe('Agent teardown of factory dispatchers without an internal url', () => {
  test('ProxyAgent forwarding plain http does not crash on teardown', async (t) => {
    // A minimal forward proxy: answers any absolute-form request itself.
    const proxy = createServer((req, res) => {
      res.setHeader('connection', 'close')
      res.end('ok')
    }).listen(0)

    t.after(() => {
      proxy.closeAllConnections?.()
      proxy.close()
    })
    await once(proxy, 'listening')

    const proxyAgent = new ProxyAgent(`http://localhost:${proxy.address().port}`)
    t.after(() => proxyAgent.close())

    // A plain-http request registers an Http1ProxyWrapper, which has no kUrl,
    // in the inner Agent's client map.
    const { statusCode, body } = await request('http://target.example/', { dispatcher: proxyAgent })
    assert.equal(statusCode, 200)
    await body.text()

    let innerAgent
    for (const sym of Object.getOwnPropertySymbols(proxyAgent)) {
      const value = proxyAgent[sym]
      if (value && value[kClients] instanceof Map && value[kClients].size > 0) {
        innerAgent = value
        break
      }
    }
    assert.ok(innerAgent, 'expected to find the inner Agent')
    const [wrapper] = innerAgent[kClients].values()

    // The Agent subscribes to this event on every dispatcher its factory
    // returns. Before the fix this threw
    // "Cannot read properties of undefined (reading 'origin')".
    wrapper.emit('disconnect', 'http://target.example', [wrapper], new Error('closed'))

    assert.equal(innerAgent[kClients].size, 0, 'expected the unused wrapper to be removed')
  })
})
