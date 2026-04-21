const { test, describe } = require('node:test')
const assert = require('node:assert')
const { createServer } = require('node:http')
const { request, Agent, Pool } = require('..')

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
