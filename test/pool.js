'use strict'

const proxyquire = require('proxyquire')
const { test } = require('tap')
const { Pool } = require('..')
const { createServer } = require('http')
const { EventEmitter } = require('events')
const { promisify } = require('util')
const eos = require('end-of-stream')

test('basic get', (t) => {
  t.plan(6)

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Pool(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
      t.error(err)
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
  })
})

test('basic get with async/await', async (t) => {
  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)
  const client = new Pool(`http://localhost:${server.address().port}`)
  t.tearDown(client.close.bind(client))

  const { statusCode, headers, body } = await client.request({ path: '/', method: 'GET' })
  t.strictEqual(statusCode, 200)
  t.strictEqual(headers['content-type'], 'text/plain')

  body.resume()
  await promisify(eos)(body)
})

test('backpressure algorithm', (t) => {
  const seen = []
  let total = 0
  let writeMore = false

  class FakeClient extends EventEmitter {
    constructor () {
      super()

      this.id = total++
    }

    request (req, cb) {
      seen.push({ req, cb, client: this })
      return writeMore
    }
  }

  const Pool = proxyquire('../lib/pool', {
    './client': FakeClient
  })

  const pool = new Pool('http://notanhost')

  t.strictEqual(total, 10)

  writeMore = true

  pool.request({}, noop)
  pool.request({}, noop)

  const d1 = seen.shift()
  const d2 = seen.shift()

  t.strictEqual(d1.client, d2.client)

  writeMore = false
  pool.request({}, noop)

  writeMore = true
  pool.request({}, noop)

  const d3 = seen.shift()
  const d4 = seen.shift()

  t.strictEqual(d3.client, d2.client)
  t.notStrictEqual(d3.client, d4.client)

  d3.client.emit('drain')

  writeMore = false
  pool.request({}, noop)

  writeMore = true
  pool.request({}, noop)

  const d5 = seen.shift()
  const d6 = seen.shift()

  t.strictEqual(d5.client, d4.client)
  t.strictEqual(d3.client, d6.client)

  t.end()
})

function noop () {}
