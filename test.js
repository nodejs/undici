'use strict'

const { test } = require('tap')
const Undici = require('.')
const { createServer } = require('http')
const { readFileSync } = require('fs')

test('basic get', (t) => {
  t.plan(5)

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Undici(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.call({ path: '/', method: 'GET' }, (err, { headers, body }) => {
      t.error(err)
      t.strictEqual(headers.statusCode, 200)
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

test('basic POST with string', (t) => {
  t.plan(6)

  const expected = readFileSync(__filename, 'utf8')

  const server = createServer((req, res) => {
    t.strictEqual(req.url, '/')
    t.strictEqual(req.method, 'POST')

    req.setEncoding('utf8')
    let data = ''

    req.on('data', function (d) { data += d })

    req.on('end', () => {
      t.strictEqual(data, expected)
    })

    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Undici(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.call({ path: '/', method: 'POST', body: expected }, (err, { headers, body }) => {
      t.error(err)
      t.strictEqual(headers.statusCode, 200)
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
