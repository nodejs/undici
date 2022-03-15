'use strict'

const { test } = require('tap')
const { BalancedPool, Client, errors, Pool } = require('..')
const { createServer } = require('http')
const { promisify } = require('util')

test('upstream add/remove/get', async (t) => {
  const client = new BalancedPool()
  t.same(client.upstreams, [])
  client.addUpstream('http://localhost:4242')
  t.same(client.upstreams, ['http://localhost:4242'])
  client.addUpstream('http://localhost:2424')
  client.addUpstream('http://localhost:2424')
  t.same(client.upstreams, ['http://localhost:4242', 'http://localhost:2424'])
  client.removeUpstream('http://localhost:4242')
  t.same(client.upstreams, ['http://localhost:2424'])
  client.removeUpstream('http://localhost:2424')
  t.same(client.upstreams, [])

  client.addUpstream('http://localhost:80')
  client.addUpstream('http://localhost:80')
  client.addUpstream(new URL('http://localhost:80'))
  t.same(client.upstreams, ['http://localhost'])
  client.removeUpstream('http://localhost:80')
  t.same(client.upstreams, [])

  t.throws(() => client.dispatch())

  const p = client.close()
  t.ok(p instanceof Promise)
  await p
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

test('invalid options throws', (t) => {
  t.plan(2)

  try {
    new BalancedPool(null, { factory: '' }) // eslint-disable-line
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'factory must be a function.')
  }
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
