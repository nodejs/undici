'use strict'

const proxyquire = require('proxyquire')
const { test } = require('tap')
const { Pool } = require('..')
const { createServer } = require('http')
const { EventEmitter } = require('events')
const { promisify } = require('util')
const eos = require('stream').finished

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

  class FakeClient extends EventEmitter {
    constructor () {
      super()

      this.id = total++
      this._full = false
    }

    get full () {
      return this._full
    }

    get connected () {
      return true
    }

    request (req, cb) {
      seen.push({ req, cb, client: this, id: this.id })
    }
  }

  const Pool = proxyquire('../lib/pool', {
    './client': FakeClient
  })

  const pool = new Pool('http://notanhost')

  t.strictEqual(total, 10)

  pool.request({}, noop)
  pool.request({}, noop)

  const d1 = seen.shift() // d1 = c0
  t.strictEqual(d1.id, 0)
  const d2 = seen.shift() // d1 = c0
  t.strictEqual(d1.id, 0)

  t.strictEqual(d1.id, d2.id)

  pool.request({}, noop) // d3 = c0

  d1.client._full = true

  pool.request({}, noop) // d4 = c1

  const d3 = seen.shift()
  t.strictEqual(d3.id, 0)
  const d4 = seen.shift()
  t.strictEqual(d4.id, 1)

  t.strictEqual(d3.id, d2.id)
  t.notStrictEqual(d3.id, d4.id)

  pool.request({}, noop) // d5 = c1

  d1.client._full = false

  pool.request({}, noop) // d6 = c0

  const d5 = seen.shift()
  t.strictEqual(d5.id, 1)
  const d6 = seen.shift()
  t.strictEqual(d6.id, 0)

  t.strictEqual(d5.id, d4.id)
  t.strictEqual(d3.id, d6.id)

  t.end()
})

function noop () {}
