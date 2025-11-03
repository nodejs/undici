'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createServer } = require('node:http')
const { promisify } = require('node:util')
const {
  RoundRobinPool,
  Client,
  errors
} = require('..')

test('throws when connection is infinite', async (t) => {
  t = tspl(t, { plan: 2 })

  try {
    new RoundRobinPool(null, { connections: 0 / 0 }) // eslint-disable-line
  } catch (e) {
    t.ok(e instanceof errors.InvalidArgumentError)
    t.strictEqual(e.message, 'invalid connections')
  }
})

test('throws when connections is negative', async (t) => {
  t = tspl(t, { plan: 2 })

  try {
    new RoundRobinPool(null, { connections: -1 }) // eslint-disable-line
  } catch (e) {
    t.ok(e instanceof errors.InvalidArgumentError)
    t.strictEqual(e.message, 'invalid connections')
  }
})

test('throws when factory is not a function', (t) => {
  const p = tspl(t, { plan: 2 })

  try {
    new RoundRobinPool('http://localhost', { factory: '' }) // eslint-disable-line
  } catch (err) {
    p.ok(err instanceof errors.InvalidArgumentError)
    p.strictEqual(err.message, 'factory must be a function.')
  }
})

test('basic get', async (t) => {
  t = tspl(t, { plan: 4 })

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })

  after(() => server.close())

  await new Promise(resolve => server.listen(0, resolve))

  const pool = new RoundRobinPool(`http://localhost:${server.address().port}`, {
    connections: 1
  })

  after(() => pool.close())

  const { statusCode, body } = await pool.request({ path: '/', method: 'GET' })
  t.strictEqual(statusCode, 200)

  const text = await body.text()
  t.strictEqual(text, 'hello')

  await t.completed
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
    const pool = new RoundRobinPool(`http://localhost:${server.address().port}`, {
      connections: clients,
      keepAliveTimeoutThreshold: 100
    })
    t.after(() => pool.close())

    pool.on('connect', (origin, [pool, client]) => {
      p.ok(client instanceof Client)
    })
    pool.on('disconnect', (origin, [pool, client], error) => {
      p.ok(client instanceof Client)
      p.ok(error instanceof errors.InformationalError)
      p.strictEqual(error.code, 'UND_ERR_INFO')
    })

    for (let i = 0; i < clients; i++) {
      pool.request({
        path: '/',
        method: 'GET'
      }, (err, { body }) => {
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
    const client = new RoundRobinPool(`http://localhost:${server.address().port}`, {
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
  const p = tspl(t, { plan: 8 })

  let factoryCalled = 0
  const opts = {
    connections: 1,
    factory: (origin, opts) => {
      factoryCalled++
      return new Client(origin, opts)
    }
  }

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.after(server.close.bind(server))

  await promisify(server.listen).call(server, 0)

  const client = new RoundRobinPool(`http://localhost:${server.address().port}`, opts)

  t.after(client.destroy.bind(client))

  const { statusCode, headers, body } = await client.request({ path: '/', method: 'GET' })
  p.strictEqual(statusCode, 200)
  p.strictEqual(headers['content-type'], 'text/plain')
  p.strictEqual('hello', await body.text())

  p.ok(factoryCalled >= 1) // May create one or more clients

  p.strictEqual(client.destroyed, false)
  p.strictEqual(client.closed, false)
  await client.close()
  p.strictEqual(client.destroyed, true)
  p.strictEqual(client.closed, true)
})

test('round-robin distribution with multiple requests', async (t) => {
  const p = tspl(t, { plan: 2 })

  let totalRequests = 0
  const clientRequests = new Map() // Track requests per client connection

  const server = createServer((req, res) => {
    totalRequests++
    // Track which connection this request came from via socket remote port
    const clientKey = `${req.socket.remoteAddress}:${req.socket.remotePort}`
    clientRequests.set(clientKey, (clientRequests.get(clientKey) || 0) + 1)

    // Add delay to make clients busy and force creation of multiple connections
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('ok')
    }, 50)
  })

  after(() => server.close())

  await new Promise(resolve => server.listen(0, resolve))

  const pool = new RoundRobinPool(`http://localhost:${server.address().port}`, {
    connections: 3
  })

  after(() => pool.close())

  // This forces creation of multiple connections
  const requests = []
  for (let i = 0; i < 30; i++) {
    requests.push(pool.request({ path: '/', method: 'GET' }).then(({ body }) => body.text()))
  }
  await Promise.all(requests)

  p.strictEqual(totalRequests, 30)

  // Check that multiple connections were used (not all requests on one connection)
  // With round-robin, we should have close to equal distribution
  const requestCounts = Array.from(clientRequests.values())
  const max = Math.max(...requestCounts)
  const min = Math.min(...requestCounts)
  const ratio = max / min

  // With round-robin and concurrent requests forcing multiple connections:
  // should see relatively even distribution (ratio < 2.5)
  p.ok(ratio < 2.5, `Distribution ratio ${ratio.toFixed(2)}x should be < 2.5 (counts: ${requestCounts.join(', ')})`)

  await p.completed
})

test('round-robin wraps around correctly', async (t) => {
  t = tspl(t, { plan: 2 })

  let requestCount = 0
  const server = createServer((req, res) => {
    requestCount++
    res.writeHead(200)
    res.end('ok')
  })

  after(() => server.close())
  await new Promise(resolve => server.listen(0, resolve))

  const pool = new RoundRobinPool(`http://localhost:${server.address().port}`, {
    connections: 2
  })

  after(() => pool.close())

  // Make more requests than connections to ensure wrapping
  for (let i = 0; i < 5; i++) {
    const { body } = await pool.request({ path: '/', method: 'GET' })
    await body.text()
  }

  t.strictEqual(requestCount, 5)
  t.ok(pool.stats.connected <= 2)

  await t.completed
})

test('close/destroy behavior', async (t) => {
  t = tspl(t, { plan: 4 })

  const server = createServer((req, res) => {
    res.end('ok')
  })

  after(() => server.close())
  await new Promise(resolve => server.listen(0, resolve))

  const pool = new RoundRobinPool(`http://localhost:${server.address().port}`)

  t.strictEqual(pool.destroyed, false)
  t.strictEqual(pool.closed, false)

  await pool.close()

  t.strictEqual(pool.destroyed, true)
  t.strictEqual(pool.closed, true)

  await t.completed
})

test('verifies round-robin kGetDispatcher cycling algorithm', async (t) => {
  t = tspl(t, { plan: 4 })

  const server = createServer((req, res) => {
    res.end('ok')
  })

  after(() => server.close())
  await new Promise(resolve => server.listen(0, resolve))

  const clientOrder = []
  let clientIdCounter = 0

  const pool = new RoundRobinPool(`http://localhost:${server.address().port}`, {
    connections: 3,
    factory: (origin, opts) => {
      const client = new Client(origin, opts)
      const id = clientIdCounter++

      // Intercept dispatch to track which client handles each request
      const originalDispatch = client.dispatch.bind(client)
      client.dispatch = function (opts, handler) {
        clientOrder.push(id)
        return originalDispatch(opts, handler)
      }

      return client
    }
  })

  after(() => pool.close())

  // Make 6 requests concurrently
  const responses = await Promise.all([
    pool.request({ path: '/', method: 'GET' }),
    pool.request({ path: '/', method: 'GET' }),
    pool.request({ path: '/', method: 'GET' }),
    pool.request({ path: '/', method: 'GET' }),
    pool.request({ path: '/', method: 'GET' }),
    pool.request({ path: '/', method: 'GET' })
  ])

  await Promise.all(responses.map(({ body }) => body.text()))

  // Verify core round-robin behavior
  t.strictEqual(clientIdCounter, 3, 'Should create exactly 3 clients')
  t.deepStrictEqual(clientOrder.slice(0, 3), [0, 1, 2], 'First 3 dispatches create clients 0,1,2 in order')
  t.ok(clientOrder.every(id => id < 3), 'All dispatches use one of the 3 clients')

  // Verify all clients were used (proves cycling)
  const uniqueClients = new Set(clientOrder)
  t.strictEqual(uniqueClients.size, 3, 'All 3 clients used (cycling verified)')

  await t.completed
})
