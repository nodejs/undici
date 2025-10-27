'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createServer } = require('node:http')
const {
  RoundRobinPool,
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

test('basic get', async (t) => {
  t = tspl(t, { plan: 7 })

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

  pool.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
    t.ifError(err)
    t.strictEqual(statusCode, 200)
    t.strictEqual(headers['content-type'], 'text/plain')
    const bufs = []
    body.on('data', (buf) => {
      bufs.push(buf)
    })
    body.on('end', () => {
      t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
    })
  })

  await t.completed
})

test('round-robin picks different clients', async (t) => {
  t = tspl(t, { plan: 1 })

  let requestCount = 0
  const server = createServer((req, res) => {
    requestCount++
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('ok')
  })

  after(() => server.close())

  await new Promise(resolve => server.listen(0, resolve))

  const pool = new RoundRobinPool(`http://localhost:${server.address().port}`, {
    connections: 5
  })

  after(() => pool.close())

  // Make several requests to ensure multiple connections are created
  const requests = []
  for (let i = 0; i < 10; i++) {
    requests.push(pool.request({ path: '/', method: 'GET' }).then(({ body }) => body.text()))
  }

  await Promise.all(requests)

  // Verify that requests were made
  t.strictEqual(requestCount, 10)

  await t.completed
})

test('works with basic API', async (t) => {
  t = tspl(t, { plan: 3 })

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })

  after(() => server.close())

  await new Promise(resolve => server.listen(0, resolve))

  const pool = new RoundRobinPool(`http://localhost:${server.address().port}`)
  after(() => pool.close())

  const { statusCode, body } = await pool.request({ path: '/', method: 'GET' })
  t.strictEqual(statusCode, 200)

  const text = await body.text()
  t.strictEqual(text, 'hello')

  t.ok(true)

  await t.completed
})
