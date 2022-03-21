'use strict'

const { createServer } = require('http')
const { promisify } = require('util')
const { test } = require('tap')
const {
  BalancedPool,
  Client,
  errors,
  Pool
} = require('..')

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
