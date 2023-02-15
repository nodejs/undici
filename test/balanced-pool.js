'use strict'

const { test } = require('tap')
const { BalancedPool, Pool, Client, errors } = require('..')
const { nodeMajor } = require('../lib/core/util')
const { createServer } = require('http')
const { promisify } = require('util')

test('throws when factory is not a function', (t) => {
  t.plan(2)

  try {
    new BalancedPool(null, { factory: '' }) // eslint-disable-line
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'factory must be a function.')
  }
})

test('add/remove upstreams', (t) => {
  t.plan(7)

  const upstream01 = 'http://localhost:1'
  const upstream02 = 'http://localhost:2'

  const pool = new BalancedPool()
  t.same(pool.upstreams, [])

  // try to remove non-existent upstream
  pool.removeUpstream(upstream01)
  t.same(pool.upstreams, [])

  pool.addUpstream(upstream01)
  t.same(pool.upstreams, [upstream01])

  // try to add the same upstream
  pool.addUpstream(upstream01)
  t.same(pool.upstreams, [upstream01])

  pool.addUpstream(upstream02)
  t.same(pool.upstreams, [upstream01, upstream02])

  pool.removeUpstream(upstream02)
  t.same(pool.upstreams, [upstream01])

  pool.removeUpstream(upstream01)
  t.same(pool.upstreams, [])
})

test('basic get', async (t) => {
  t.plan(16)

  let server1Called = 0
  const server1 = createServer((req, res) => {
    server1Called++
    t.equal('/', req.url)
    t.equal('GET', req.method)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.teardown(server1.close.bind(server1))

  await promisify(server1.listen).call(server1, 0)

  let server2Called = 0
  const server2 = createServer((req, res) => {
    server2Called++
    t.equal('/', req.url)
    t.equal('GET', req.method)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.teardown(server2.close.bind(server2))

  await promisify(server2.listen).call(server2, 0)

  const client = new BalancedPool()
  client.addUpstream(`http://localhost:${server1.address().port}`)
  client.addUpstream(`http://localhost:${server2.address().port}`)
  t.teardown(client.destroy.bind(client))

  {
    const { statusCode, headers, body } = await client.request({ path: '/', method: 'GET' })
    t.equal(statusCode, 200)
    t.equal(headers['content-type'], 'text/plain')
    t.equal('hello', await body.text())
  }

  {
    const { statusCode, headers, body } = await client.request({ path: '/', method: 'GET' })
    t.equal(statusCode, 200)
    t.equal(headers['content-type'], 'text/plain')
    t.equal('hello', await body.text())
  }

  t.equal(server1Called, 1)
  t.equal(server2Called, 1)

  t.equal(client.destroyed, false)
  t.equal(client.closed, false)
  await client.close()
  t.equal(client.destroyed, true)
  t.equal(client.closed, true)
})

test('connect/disconnect event(s)', (t) => {
  const clients = 2

  t.plan(clients * 5)

  const server = createServer((req, res) => {
    res.writeHead(200, {
      Connection: 'keep-alive',
      'Keep-Alive': 'timeout=1s'
    })
    res.end('ok')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const pool = new BalancedPool(`http://localhost:${server.address().port}`, {
      connections: clients,
      keepAliveTimeoutThreshold: 100
    })
    t.teardown(pool.close.bind(pool))

    pool.on('connect', (origin, [pool, pool2, client]) => {
      t.equal(client instanceof Client, true)
    })
    pool.on('disconnect', (origin, [pool, pool2, client], error) => {
      t.ok(client instanceof Client)
      t.type(error, errors.InformationalError)
      t.equal(error.code, 'UND_ERR_INFO')
    })

    for (let i = 0; i < clients; i++) {
      pool.request({
        path: '/',
        method: 'GET'
      }, (err, { headers, body }) => {
        t.error(err)
        body.resume()
      })
    }
  })
})

test('busy', (t) => {
  t.plan(8 * 6 + 2 + 1)

  const server = createServer((req, res) => {
    t.equal('/', req.url)
    t.equal('GET', req.method)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new BalancedPool(`http://localhost:${server.address().port}`, {
      connections: 2,
      pipelining: 2
    })
    client.on('drain', () => {
      t.pass()
    })
    client.on('connect', () => {
      t.pass()
    })
    t.teardown(client.destroy.bind(client))

    for (let n = 1; n <= 8; ++n) {
      client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
        t.error(err)
        t.equal(statusCode, 200)
        t.equal(headers['content-type'], 'text/plain')
        const bufs = []
        body.on('data', (buf) => {
          bufs.push(buf)
        })
        body.on('end', () => {
          t.equal('hello', Buffer.concat(bufs).toString('utf8'))
        })
      })
    }
  })
})

test('factory option with basic get request', async (t) => {
  t.plan(12)

  let factoryCalled = 0
  const opts = {
    factory: (origin, opts) => {
      factoryCalled++
      return new Pool(origin, opts)
    }
  }

  const client = new BalancedPool([], opts) // eslint-disable-line

  let serverCalled = 0
  const server = createServer((req, res) => {
    serverCalled++
    t.equal('/', req.url)
    t.equal('GET', req.method)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen).call(server, 0)

  client.addUpstream(`http://localhost:${server.address().port}`)

  t.same(client.upstreams, [`http://localhost:${server.address().port}`])

  t.teardown(client.destroy.bind(client))

  {
    const { statusCode, headers, body } = await client.request({ path: '/', method: 'GET' })
    t.equal(statusCode, 200)
    t.equal(headers['content-type'], 'text/plain')
    t.equal('hello', await body.text())
  }

  t.equal(serverCalled, 1)
  t.equal(factoryCalled, 1)

  t.equal(client.destroyed, false)
  t.equal(client.closed, false)
  await client.close()
  t.equal(client.destroyed, true)
  t.equal(client.closed, true)
})

test('throws when upstream is missing', async (t) => {
  t.plan(2)

  const pool = new BalancedPool()

  try {
    await pool.request({ path: '/', method: 'GET' })
  } catch (e) {
    t.type(e, errors.BalancedPoolMissingUpstreamError)
    t.equal(e.message, 'No upstream has been added to the BalancedPool')
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
    config: [{ server: 'A' }, { server: 'B' }, { server: 'C', downOnRequests: [1] }],
    expected: ['A', 'B', 'C', 'A', 'B', 'C/connectionRefused', 'A', 'B', 'A', 'B', 'A', 'B', 'C', 'A', 'B', 'C'],
    expectedConnectionRefusedErrors: 1,
    expectedSocketErrors: 0,
    expectedRatios: [0.34, 0.34, 0.32],

    // Skip because the behavior of Node.js has changed
    skip: nodeMajor >= 19
  },

  // 8

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

  // 9

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

  // 10
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

for (const [index, { config, expected, expectedRatios, iterations = 9, expectedConnectionRefusedErrors = 0, expectedSocketErrors = 0, maxWeightPerServer, errorPenalty = 10, only = false, skip = false }] of cases.entries()) {
  test(`weighted round robin - case ${index}`, { only, skip }, async (t) => {
    // cerate an array to store succesfull reqeusts
    const requestLog = []

    // create instances of the test servers according to the config
    const servers = config.map((serverConfig) => new TestServer({
      config: serverConfig,
      onRequest: (server) => {
        requestLog.push(server.name)
      }
    }))
    t.teardown(() => servers.map(server => server.stop()))

    // start all servers to get a port so that we can build the upstream urls to supply them to undici
    await Promise.all(servers.map(server => server.start()))

    // build upstream urls
    const urls = servers.map(server => `http://localhost:${server.port}`)

    // add upstreams
    const client = new BalancedPool(urls[0], { maxWeightPerServer, errorPenalty })
    urls.slice(1).map(url => client.addUpstream(url))

    let connectionRefusedErrors = 0
    let socketErrors = 0
    for (let i = 0; i < iterations; i++) {
      // setup test servers for the next iteration

      await Promise.all(servers.map(server => server.prepareForIteration(i)))

      // send a request using undinci
      try {
        await client.request({ path: '/', method: 'GET' })
      } catch (e) {
        const serverWithError = servers.find(server => server.port === e.port) || servers.find(server => server.port === e.socket.remotePort)
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

    t.equal(totalRequests, iterations)

    t.equal(connectionRefusedErrors, expectedConnectionRefusedErrors)
    t.equal(socketErrors, expectedSocketErrors)

    if (expectedRatios) {
      const ratios = servers.reduce((acc, el) => {
        acc[el.name] = 0
        return acc
      }, {})
      requestLog.map(el => ratios[el[0]]++)

      t.match(Object.keys(ratios).map(k => ratios[k] / iterations), expectedRatios)
    }

    if (expected) {
      t.match(requestLog.slice(0, expected.length), expected)
    }

    await client.close()
  })
}
