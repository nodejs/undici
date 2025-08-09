'use strict'

const { createServer, createSecureServer } = require('node:http2')
const { once } = require('node:events')
const { test } = require('node:test')

const { tspl } = require('@matteo.collina/tspl')
const pem = require('./fixtures/test-cert')

const { H2CClient } = require('..')

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
  const planner = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    res.writeHead(200)
    res.end('Hello, world!')
  })

  server.listen()
  await once(server, 'listening')
  const client = new H2CClient(`http://localhost:${server.address().port}/`)

  t.after(() => client.close())
  t.after(() => server.close())

  const response = await client
    .request({ path: '/', method: 'GET' })
    .catch(console.log)
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

test('Should support h2c connection', async t => {
  const planner = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    res.writeHead(200)
    res.end('Hello, world!')
  })

  server.listen()
  await once(server, 'listening')
  const client = new H2CClient(`http://localhost:${server.address().port}/`)

  t.after(() => client.close())
  t.after(() => server.close())

  const response = await client.request({ path: '/', method: 'GET' })
  planner.equal(response.statusCode, 200)
  planner.equal(await response.body.text(), 'Hello, world!')
})

test('Should reject request if not h2c supported', async t => {
  const planner = tspl(t, { plan: 1 })

  const server = createSecureServer(pem, (req, res) => {
    res.writeHead(200)
    res.end('Hello, world!')
  })

  server.on('sessionError', console.error)
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
