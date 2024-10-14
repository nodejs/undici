'use strict'

const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { BalancedPool, Pool, Client, errors } = require('../..')
const { createServer } = require('node:http')
const { promisify } = require('node:util')
const { tspl } = require('@matteo.collina/tspl')

test('throws when factory is not a function', (t) => {
  const p = tspl(t, { plan: 2 })

  try {
    new BalancedPool(null, { factory: '' }) // eslint-disable-line
  } catch (err) {
    p.ok(err instanceof errors.InvalidArgumentError)
    p.strictEqual(err.message, 'factory must be a function.')
  }
})

test('add/remove upstreams', (t) => {
  const p = tspl(t, { plan: 7 })

  const upstream01 = 'http://localhost:1'
  const upstream02 = 'http://localhost:2'

  const pool = new BalancedPool()
  p.deepStrictEqual(pool.upstreams, [])

  // try to remove non-existent upstream
  pool.removeUpstream(upstream01)
  p.deepStrictEqual(pool.upstreams, [])

  pool.addUpstream(upstream01)
  p.deepStrictEqual(pool.upstreams, [upstream01])

  // try to add the same upstream
  pool.addUpstream(upstream01)
  p.deepStrictEqual(pool.upstreams, [upstream01])

  pool.addUpstream(upstream02)
  p.deepStrictEqual(pool.upstreams, [upstream01, upstream02])

  pool.removeUpstream(upstream02)
  p.deepStrictEqual(pool.upstreams, [upstream01])

  pool.removeUpstream(upstream01)
  p.deepStrictEqual(pool.upstreams, [])
})

test('basic get', async (t) => {
  const p = tspl(t, { plan: 16 })

  let server1Called = 0
  const server1 = createServer((req, res) => {
    server1Called++
    p.strictEqual('/', req.url)
    p.strictEqual('GET', req.method)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.after(server1.close.bind(server1))

  await promisify(server1.listen).call(server1, 0)

  let server2Called = 0
  const server2 = createServer((req, res) => {
    server2Called++
    p.strictEqual('/', req.url)
    p.strictEqual('GET', req.method)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.after(server2.close.bind(server2))

  await promisify(server2.listen).call(server2, 0)

  const client = new BalancedPool()
  client.addUpstream(`http://localhost:${server1.address().port}`)
  client.addUpstream(`http://localhost:${server2.address().port}`)
  t.after(client.destroy.bind(client))

  {
    const { statusCode, headers, body } = await client.request({ path: '/', method: 'GET' })
    p.strictEqual(statusCode, 200)
    p.strictEqual(headers['content-type'], 'text/plain')
    p.strictEqual('hello', await body.text())
  }

  {
    const { statusCode, headers, body } = await client.request({ path: '/', method: 'GET' })
    p.strictEqual(statusCode, 200)
    p.strictEqual(headers['content-type'], 'text/plain')
    p.strictEqual('hello', await body.text())
  }

  p.strictEqual(server1Called, 1)
  p.strictEqual(server2Called, 1)

  p.strictEqual(client.destroyed, false)
  p.strictEqual(client.closed, false)
  await client.close()
  p.strictEqual(client.destroyed, true)
  p.strictEqual(client.closed, true)
})

test('connect/disconnect event(s)', async (t) => {
  const clients = 2

  const p = tspl(t, { plan: clients * 5 })

  const server = createServer((req, res) => {
    res.writeHead(200, {
      Connection: 'keep-alive',
      'Keep-Alive': 'timeout=1s'
    })
    res.end('ok')
  })
  t.after(server.close.bind(server))

  server.listen(0, () => {
    const pool = new BalancedPool(`http://localhost:${server.address().port}`, {
      connections: clients,
      keepAliveTimeoutThreshold: 100
    })
    t.after(() => pool.close.bind(pool)())

    pool.on('connect', (origin, [pool, pool2, client]) => {
      p.ok(client instanceof Client)
    })
    pool.on('disconnect', (origin, [pool, pool2, client], error) => {
      p.ok(client instanceof Client)
      p.ok(error instanceof errors.InformationalError)
      p.strictEqual(error.code, 'UND_ERR_INFO')
    })

    for (let i = 0; i < clients; i++) {
      pool.request({
        path: '/',
        method: 'GET'
      }, (err, { headers, body }) => {
        p.ifError(err)
        body.resume()
      })
    }
  })

  await p.completed
})

test('busy', async (t) => {
  const p = tspl(t, { plan: 8 * 6 + 2 + 1 })

  const server = createServer((req, res) => {
    p.strictEqual('/', req.url)
    p.strictEqual('GET', req.method)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.after(server.close.bind(server))

  server.listen(0, async () => {
    const client = new BalancedPool(`http://localhost:${server.address().port}`, {
      connections: 2,
      pipelining: 2
    })
    client.on('drain', () => {
      p.ok(1)
    })
    client.on('connect', () => {
      p.ok(1)
    })
    t.after(client.destroy.bind(client))

    for (let n = 1; n <= 8; ++n) {
      client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
        p.ifError(err)
        p.strictEqual(statusCode, 200)
        p.strictEqual(headers['content-type'], 'text/plain')
        const bufs = []
        body.on('data', (buf) => {
          bufs.push(buf)
        })
        body.on('end', () => {
          p.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
        })
      })
    }
  })

  await p.completed
})

test('factory option with basic get request', async (t) => {
  const p = tspl(t, { plan: 12 })

  let factoryCalled = 0
  const opts = {
    factory: (origin, opts) => {
      factoryCalled++
      return new Pool(origin, opts)
    }
  }

  const client = new BalancedPool([], opts)

  let serverCalled = 0
  const server = createServer((req, res) => {
    serverCalled++
    p.strictEqual('/', req.url)
    p.strictEqual('GET', req.method)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.after(server.close.bind(server))

  await promisify(server.listen).call(server, 0)

  client.addUpstream(`http://localhost:${server.address().port}`)

  p.deepStrictEqual(client.upstreams, [`http://localhost:${server.address().port}`])

  t.after(client.destroy.bind(client))

  {
    const { statusCode, headers, body } = await client.request({ path: '/', method: 'GET' })
    p.strictEqual(statusCode, 200)
    p.strictEqual(headers['content-type'], 'text/plain')
    p.strictEqual('hello', await body.text())
  }

  p.strictEqual(serverCalled, 1)
  p.strictEqual(factoryCalled, 1)

  p.strictEqual(client.destroyed, false)
  p.strictEqual(client.closed, false)
  await client.close()
  p.strictEqual(client.destroyed, true)
  p.strictEqual(client.closed, true)
})

test('throws when upstream is missing', async (t) => {
  const p = tspl(t, { plan: 2 })

  const pool = new BalancedPool()

  try {
    await pool.request({ path: '/', method: 'GET' })
  } catch (e) {
    p.ok(e instanceof errors.BalancedPoolMissingUpstreamError)
    p.strictEqual(e.message, 'No upstream has been added to the BalancedPool')
  }
})

class TestServer {
  constructor ({ config: { server, socketHangup, downOnRequests, socketHangupOnRequests }, onRequest }) {
    this.config = {
      downOnRequests: downOnRequests || [],
      socketHangupOnRequests: socketHangupOnRequests || [],
      socketHangup
    }
    this.name = server
    // start a server listening to any port available on the host
    this.port = 0
    this.iteration = 0
    this.requestsCount = 0
    this.onRequest = onRequest
    this.server = null
  }

  _shouldHangupOnClient () {
    if (this.config.socketHangup) {
      return true
    }
    if (this.config.socketHangupOnRequests.includes(this.requestsCount)) {
      return true
    }

    return false
  }

  _shouldStopServer () {
    if (this.config.upstreamDown === true || this.config.downOnRequests.includes(this.requestsCount)) {
      return true
    }
    return false
  }

  async prepareForIteration (iteration) {
    // set current iteration
    this.iteration = iteration

    if (this._shouldStopServer()) {
      await this.stop()
    } else if (!this.isRunning()) {
      await this.start()
    }
  }

  start () {
    this.server = createServer((req, res) => {
      if (this._shouldHangupOnClient()) {
        req.destroy(new Error('(ツ)'))
        return
      }
      this.requestsCount++
      res.end('server is running!')

      this.onRequest(this)
    }).listen(this.port)

    this.server.keepAliveTimeout = 2000

    return new Promise((resolve) => {
      this.server.on('listening', () => {
      // store the used port to use it again if the server was stopped as part of test and then started again
        this.port = this.server.address().port

        return resolve()
      })
    })
  }

  isRunning () {
    return !!this.server.address()
  }

  stop () {
    if (!this.isRunning()) {
      return
    }

    return new Promise(resolve => {
      this.server.close(() => resolve())
    })
  }
}

const cases = [

  // 0

  {
    iterations: 100,
    maxWeightPerServer: 100,
    errorPenalty: 7,
    config: [{ server: 'A' }, { server: 'B' }, { server: 'C' }],
    expected: ['A', 'B', 'C', 'A', 'B', 'C', 'A', 'B', 'C', 'A', 'B', 'C'],
    expectedConnectionRefusedErrors: 0,
    expectedSocketErrors: 0,
    expectedRatios: [0.34, 0.33, 0.33]
  },

  // 1

  {
    iterations: 100,
    maxWeightPerServer: 100,
    errorPenalty: 15,
    config: [{ server: 'A', downOnRequests: [0] }, { server: 'B' }, { server: 'C' }],
    expected: ['A/connectionRefused', 'B', 'C', 'B', 'C', 'B', 'C', 'A', 'B', 'C', 'A'],
    expectedConnectionRefusedErrors: 1,
    expectedSocketErrors: 0,
    expectedRatios: [0.32, 0.34, 0.34]
  },

  // 2

  {
    iterations: 100,
    maxWeightPerServer: 100,
    errorPenalty: 15,
    config: [{ server: 'A' }, { server: 'B', downOnRequests: [0] }, { server: 'C' }],
    expected: ['A', 'B/connectionRefused', 'C', 'A', 'C', 'A', 'C', 'A', 'B', 'C'],
    expectedConnectionRefusedErrors: 1,
    expectedSocketErrors: 0,
    expectedRatios: [0.34, 0.32, 0.34]
  },

  // 3

  {
    iterations: 100,
    maxWeightPerServer: 100,
    errorPenalty: 15,
    config: [{ server: 'A' }, { server: 'B', downOnRequests: [0] }, { server: 'C', downOnRequests: [0] }],
    expected: ['A', 'B/connectionRefused', 'C/connectionRefused', 'A', 'A', 'A', 'B', 'C'],
    expectedConnectionRefusedErrors: 2,
    expectedSocketErrors: 0,
    expectedRatios: [0.35, 0.33, 0.32]
  },

  // 4

  {
    iterations: 100,
    maxWeightPerServer: 100,
    errorPenalty: 15,
    config: [{ server: 'A', downOnRequests: [0] }, { server: 'B', downOnRequests: [0] }, { server: 'C', downOnRequests: [0] }],
    expected: ['A/connectionRefused', 'B/connectionRefused', 'C/connectionRefused', 'A', 'B', 'C', 'A', 'B', 'C'],
    expectedConnectionRefusedErrors: 3,
    expectedSocketErrors: 0,
    expectedRatios: [0.34, 0.33, 0.33]
  },

  // 5

  {
    iterations: 100,
    maxWeightPerServer: 100,
    errorPenalty: 15,
    config: [{ server: 'A', downOnRequests: [0, 1, 2] }, { server: 'B', downOnRequests: [0, 1, 2] }, { server: 'C', downOnRequests: [0, 1, 2] }],
    expected: ['A/connectionRefused', 'B/connectionRefused', 'C/connectionRefused', 'A/connectionRefused', 'B/connectionRefused', 'C/connectionRefused', 'A/connectionRefused', 'B/connectionRefused', 'C/connectionRefused', 'A', 'B', 'C', 'A', 'B', 'C'],
    expectedConnectionRefusedErrors: 9,
    expectedSocketErrors: 0,
    expectedRatios: [0.34, 0.33, 0.33]
  },

  // 6

  {
    iterations: 100,
    maxWeightPerServer: 100,
    errorPenalty: 15,
    config: [{ server: 'A', downOnRequests: [0] }, { server: 'B', downOnRequests: [0, 1] }, { server: 'C', downOnRequests: [0] }],
    expected: ['A/connectionRefused', 'B/connectionRefused', 'C/connectionRefused', 'A', 'B/connectionRefused', 'C', 'A', 'B', 'C', 'A', 'B', 'C', 'A', 'C', 'A', 'C', 'A', 'C', 'A', 'B'],
    expectedConnectionRefusedErrors: 4,
    expectedSocketErrors: 0,
    expectedRatios: [0.36, 0.29, 0.35]
  },

  // 7

  {
    iterations: 100,
    maxWeightPerServer: 100,
    errorPenalty: 15,
    config: [{ server: 'A', socketHangupOnRequests: [1] }, { server: 'B' }, { server: 'C' }],
    expected: ['A', 'B', 'C', 'A/socketError', 'B', 'C', 'B', 'C', 'B', 'C', 'A'],
    expectedConnectionRefusedErrors: 0,
    expectedSocketErrors: 1,
    expectedRatios: [0.32, 0.34, 0.34]
  },

  // 8

  {
    iterations: 100,
    maxWeightPerServer: 100,
    errorPenalty: 7,
    config: [{ server: 'A' }, { server: 'B' }, { server: 'C' }, { server: 'D' }, { server: 'E' }],
    expected: ['A', 'B', 'C', 'D', 'E', 'A', 'B', 'C', 'D', 'E'],
    expectedConnectionRefusedErrors: 0,
    expectedSocketErrors: 0,
    expectedRatios: [0.2, 0.2, 0.2, 0.2, 0.2]
  },

  // 9
  {
    iterations: 100,
    maxWeightPerServer: 100,
    errorPenalty: 15,
    config: [{ server: 'A', downOnRequests: [0, 1, 2, 3] }, { server: 'B' }, { server: 'C' }],
    expected: ['A/connectionRefused', 'B', 'C', 'B', 'C', 'B', 'C', 'A/connectionRefused', 'B', 'C', 'B', 'C', 'A/connectionRefused', 'B', 'C', 'B', 'C', 'A/connectionRefused', 'B', 'C', 'A', 'B', 'C', 'A', 'B', 'C'],
    expectedConnectionRefusedErrors: 4,
    expectedSocketErrors: 0,
    expectedRatios: [0.18, 0.41, 0.41]
  }

]

describe('weighted round robin', () => {
  for (const [index, { config, expected, expectedRatios, iterations = 9, expectedConnectionRefusedErrors = 0, expectedSocketErrors = 0, maxWeightPerServer, errorPenalty = 10, skip = false }] of cases.entries()) {
    test(`case ${index}`, { skip }, async (t) => {
    // create an array to store successful requests
      const requestLog = []

      // create instances of the test servers according to the config
      const servers = config.map((serverConfig) => new TestServer({
        config: serverConfig,
        onRequest: (server) => {
          requestLog.push(server.name)
        }
      }))
      t.after(() => servers.map(server => server.stop()))

      // start all servers to get a port so that we can build the upstream urls to supply them to undici
      await Promise.all(servers.map(server => server.start()))

      // build upstream urls
      const urls = servers.map(server => `http://localhost:${server.port}`)

      // add upstreams
      const client = new BalancedPool(urls[0], { maxWeightPerServer, errorPenalty, keepAliveTimeoutThreshold: 100 })
      urls.slice(1).map(url => client.addUpstream(url))

      let connectionRefusedErrors = 0
      let socketErrors = 0
      for (let i = 0; i < iterations; i++) {
      // setup test servers for the next iteration

        await Promise.all(servers.map(server => server.prepareForIteration(i)))

        // send a request using undici
        try {
          await client.request({ path: '/', method: 'GET' })
        } catch (e) {
          const serverWithError =
          servers.find(server => server.port === e.port) ||
          servers.find(server => {
            if (typeof AggregateError === 'function' && e instanceof AggregateError) {
              return e.errors.some(e => server.port === (e.socket?.remotePort ?? e.port))
            }

            return server.port === e.socket.remotePort
          })

          serverWithError.requestsCount++

          if (e.code === 'ECONNREFUSED') {
            requestLog.push(`${serverWithError.name}/connectionRefused`)
            connectionRefusedErrors++
          }
          if (e.code === 'UND_ERR_SOCKET') {
            requestLog.push(`${serverWithError.name}/socketError`)

            socketErrors++
          }
        }
      }
      const totalRequests = servers.reduce((acc, server) => {
        return acc + server.requestsCount
      }, 0)

      assert.strictEqual(totalRequests, iterations)

      assert.strictEqual(connectionRefusedErrors, expectedConnectionRefusedErrors)
      assert.strictEqual(socketErrors, expectedSocketErrors)

      if (expectedRatios) {
        const ratios = servers.reduce((acc, el) => {
          acc[el.name] = 0
          return acc
        }, {})
        requestLog.map(el => ratios[el[0]]++)

        assert.deepStrictEqual(Object.keys(ratios).map(k => ratios[k] / iterations), expectedRatios)
      }

      if (expected) {
        assert.deepStrictEqual(requestLog.slice(0, expected.length), expected)
      }

      await client.close()
    })
  }
})
