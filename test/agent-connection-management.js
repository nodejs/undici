const { test, describe } = require('node:test')
const assert = require('node:assert')
const { createServer } = require('node:http')
const { EventEmitter } = require('node:events')
const { request, Agent, Pool } = require('..')
const { kBusy, kConnected, kDispatch, kRunning, kUrl } = require('../lib/core/symbols')

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
  class FakeDispatcher extends EventEmitter {
    constructor (origin, { withUrl = false } = {}) {
      super()
      this[kConnected] = 0
      this[kBusy] = false
      this[kRunning] = 0
      this.destroyed = false
      this.dispatchCalls = 0

      if (withUrl) {
        this[kUrl] = new URL(origin)
      }
    }

    dispatch () {
      this.dispatchCalls++
      return true
    }

    close () {
      this.destroyed = true
      return Promise.resolve()
    }

    destroy () {
      this.destroyed = true
      return Promise.resolve()
    }
  }

  test('should ignore stale disconnect from replaced client', async () => {
    const origin = 'http://localhost:3000'
    const created = []
    const agent = new Agent({
      factory: (factoryOrigin) => {
        const dispatcher = new FakeDispatcher(String(factoryOrigin))
        created.push(dispatcher)
        return dispatcher
      }
    })

    const handler = {}

    agent[kDispatch]({ origin }, handler)
    assert.equal(created.length, 1)

    const stale = created[0]
    stale.emit('disconnect', origin, [stale], new Error('first close'))

    agent[kDispatch]({ origin }, handler)
    assert.equal(created.length, 2)

    // Simulate a late event from a stale dispatcher after replacement exists.
    stale.emit('disconnect', origin, [stale], new Error('late close'))

    agent[kDispatch]({ origin }, handler)
    assert.equal(created.length, 2)
    assert.equal(created[1].dispatchCalls, 2)

    await agent.close()
  })

  test('should ignore stale connectionError from replaced client with kUrl', async () => {
    const origin = 'http://localhost:3001'
    const created = []
    const agent = new Agent({
      factory: (factoryOrigin) => {
        const dispatcher = new FakeDispatcher(String(factoryOrigin), { withUrl: true })
        created.push(dispatcher)
        return dispatcher
      }
    })

    const handler = {}

    agent[kDispatch]({ origin }, handler)
    assert.equal(created.length, 1)

    const stale = created[0]
    stale.emit('connectionError', origin, [stale], new Error('first error'))

    agent[kDispatch]({ origin }, handler)
    assert.equal(created.length, 2)

    // Simulate a late connectionError from stale dispatcher after replacement exists.
    stale.emit('connectionError', origin, [stale], new Error('late error'))

    agent[kDispatch]({ origin }, handler)
    assert.equal(created.length, 2)
    assert.equal(created[1].dispatchCalls, 2)

    await agent.close()
  })

  test('should handle remaining client with kUrl while cleaning replaced client', async () => {
    const origin = 'http://localhost:3002'
    const created = []
    const agent = new Agent({
      factory: (factoryOrigin) => {
        const dispatcher = new FakeDispatcher(String(factoryOrigin), { withUrl: true })
        created.push(dispatcher)
        return dispatcher
      }
    })

    const handler = {}

    agent[kDispatch]({ origin }, handler)
    agent[kDispatch]({ origin, allowH2: false }, handler)
    assert.equal(created.length, 2)

    assert.doesNotThrow(() => {
      created[0].emit('disconnect', origin, [created[0]], new Error('disconnect'))
    })

    // A replacement for the non-http1-only key should still be creatable.
    agent[kDispatch]({ origin }, handler)
    assert.equal(created.length, 3)

    await agent.close()
  })

  test('should handle remaining client without kUrl while cleaning replaced client', async () => {
    const origin = 'http://localhost:3003'
    const created = []
    const agent = new Agent({
      factory: (factoryOrigin) => {
        const dispatcher = new FakeDispatcher(String(factoryOrigin))
        created.push(dispatcher)
        return dispatcher
      }
    })

    const handler = {}

    agent[kDispatch]({ origin }, handler)
    agent[kDispatch]({ origin, allowH2: false }, handler)
    assert.equal(created.length, 2)

    assert.doesNotThrow(() => {
      created[0].emit('disconnect', origin, [created[0]], new Error('disconnect'))
    })

    // A replacement for the non-http1-only key should still be creatable.
    agent[kDispatch]({ origin }, handler)
    assert.equal(created.length, 3)

    await agent.close()
  })

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
