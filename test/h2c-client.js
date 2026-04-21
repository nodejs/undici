'use strict'

const { createServer, createSecureServer } = require('node:http2')
const { once } = require('node:events')
const { test } = require('node:test')

const { tspl } = require('@matteo.collina/tspl')
const pem = require('@metcoder95/https-pem')

const { H2CClient, Client, Agent, Pool, request } = require('..')

test('Should throw if no h2c origin', async t => {
  const planner = tspl(t, { plan: 1 })

  planner.throws(() => new H2CClient('https://localhost/'))

  await planner.completed
})

test('Should throw if pipelining greather than concurrent streams', async t => {
  const planner = tspl(t, { plan: 1 })

  planner.throws(() => new H2CClient('http://localhost/', { pipelining: 10, maxConcurrentStreams: 5 }))

  await planner.completed
})

test('Should support h2c connection', async t => {
  const planner = tspl(t, { plan: 6 })
  let authority = ''

  const server = createServer((req, res) => {
    planner.equal(req.headers[':authority'], authority)
    planner.equal(req.headers[':method'], 'GET')
    planner.equal(req.headers[':path'], '/')
    planner.equal(req.headers[':scheme'], 'http')
    res.writeHead(200)
    res.end('Hello, world!')
  })

  server.listen()
  await once(server, 'listening')
  authority = `localhost:${server.address().port}`
  const client = new H2CClient(`http://${authority}/`)

  t.after(() => client.close())
  t.after(() => server.close())

  const response = await client
    .request({ path: '/', method: 'GET' })
  planner.equal(response.statusCode, 200)
  planner.equal(await response.body.text(), 'Hello, world!')
})

test('Should support h2c connection with body', async t => {
  const planner = tspl(t, { plan: 3 })
  const bodyChunks = []

  const server = createServer((req, res) => {
    req.on('data', chunk => bodyChunks.push(chunk))
    req.on('end', () => {
      res.end('Hello, world!')
    })
    res.writeHead(200, {
      'Content-Type': 'text/plain'
    })
  })

  server.listen()
  await once(server, 'listening')
  const client = new H2CClient(`http://localhost:${server.address().port}/`)

  t.after(() => client.close())
  t.after(() => server.close())

  const response = await client.request({
    path: '/',
    method: 'POST',
    body: 'Hello, world!'
  })
  planner.equal(response.statusCode, 200)
  planner.equal(await response.body.text(), 'Hello, world!')
  planner.equal(Buffer.concat(bodyChunks).toString(), 'Hello, world!')
})

test('Should reject request if not h2c supported', async t => {
  const planner = tspl(t, { plan: 1 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }), (req, res) => {
    res.writeHead(200)
    res.end('Hello, world!')
  })

  server.listen()
  await once(server, 'listening')
  const client = new H2CClient(`http://localhost:${server.address().port}/`)

  t.after(() => client.close())
  t.after(() => server.close())

  planner.rejects(
    client.request({ path: '/', method: 'GET' }),
    'SocketError: other side closed'
  )
})

test('Connect to h2c server over a unix domain socket', { skip: process.platform === 'win32' }, async t => {
  const planner = tspl(t, { plan: 6 })
  const { mkdtemp, rm } = require('node:fs/promises')
  const { join } = require('node:path')
  const { tmpdir } = require('node:os')

  const tmpDir = await mkdtemp(join(tmpdir(), 'h2c-client-'))
  const socketPath = join(tmpDir, 'server.sock')
  const authority = 'localhost'

  const server = createServer((req, res) => {
    planner.equal(req.headers[':authority'], authority)
    planner.equal(req.headers[':method'], 'GET')
    planner.equal(req.headers[':path'], '/')
    planner.equal(req.headers[':scheme'], 'http')
    res.writeHead(200)
    res.end('Hello, world!')
  })

  server.listen(socketPath)
  await once(server, 'listening')
  const client = new H2CClient(`http://${authority}/`, {
    socketPath
  })

  const response = await client.request({ path: '/', method: 'GET' })
  planner.equal(response.statusCode, 200)
  planner.equal(await response.body.text(), 'Hello, world!')

  t.after(async () => {
    await rm(tmpDir, { recursive: true })
    client.close()
    server.close()
  })
})

test('Should pass custom connect function to Client', async t => {
  const planner = tspl(t, { plan: 3 })

  const connectError = new Error('custom connect error')
  const socketPath = '/var/run/test.sock'
  const client = new H2CClient('http://localhost', {
    socketPath,
    connect (opts, cb) {
      planner.strictEqual(opts.socketPath, socketPath)
      planner.strictEqual(opts.allowH2, true)
      cb(connectError, null)
    }
  })

  t.after(() => client.close())

  client.request({
    path: '/',
    method: 'GET'
  }, (err) => {
    planner.strictEqual(err, connectError)
  })

  await planner.completed
})

test('Should throw if bad useH2c has been passed', async t => {
  t = tspl(t, { plan: 1 })

  t.throws(() => {
    // eslint-disable-next-line
    new Client('https://localhost:1000', {
      useH2c: 'true'
    })
  }, {
    message: 'useH2c must be a valid boolean value'
  })

  await t.completed
})

test('Pool with useH2c and connections > 1 should not raise HTTPParserError', async t => {
  const planner = tspl(t, { plan: 6 })

  const server = createServer((req, res) => {
    res.writeHead(200)
    res.end('Hello, world!')
  })

  server.listen(0)
  await once(server, 'listening')
  const url = `http://localhost:${server.address().port}`
  const pool = new Pool(url, { useH2c: true, connections: 2 })

  t.after(() => pool.close())
  t.after(() => server.close())

  const responses = await Promise.all([
    pool.request({ path: '/test1', method: 'GET' }),
    pool.request({ path: '/test2', method: 'GET' }),
    pool.request({ path: '/test3', method: 'GET' })
  ])

  for (const response of responses) {
    planner.equal(response.statusCode, 200)
    planner.equal(await response.body.text(), 'Hello, world!')
  }

  await planner.completed
})

test('Agent with useH2c and connections > 1 should not raise HTTPParserError', async t => {
  const planner = tspl(t, { plan: 6 })

  const server = createServer((req, res) => {
    res.writeHead(200)
    res.end('Hello, world!')
  })

  server.listen(0)
  await once(server, 'listening')
  const port = server.address().port
  const agent = new Agent({ useH2c: true, connections: 2 })

  t.after(() => agent.close())
  t.after(() => server.close())

  const responses = await Promise.all([
    request(`http://localhost:${port}/test1`, { dispatcher: agent }),
    request(`http://localhost:${port}/test2`, { dispatcher: agent }),
    request(`http://localhost:${port}/test3`, { dispatcher: agent })
  ])

  for (const response of responses) {
    planner.equal(response.statusCode, 200)
    planner.equal(await response.body.text(), 'Hello, world!')
  }

  await planner.completed
})
