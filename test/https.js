'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { Client } = require('..')
const { createServer } = require('node:https')
const pem = require('https-pem')

test('https get with tls opts', async (t) => {
  t = tspl(t, { plan: 6 })

  const server = createServer(pem, (req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`https://localhost:${server.address().port}`, {
      tls: {
        rejectUnauthorized: false
      }
    })
    after(() => client.close())

    client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
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
  })

  await t.completed
})

test('https get with tls opts ip', async (t) => {
  t = tspl(t, { plan: 6 })

  const server = createServer(pem, (req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`https://127.0.0.1:${server.address().port}`, {
      tls: {
        rejectUnauthorized: false
      }
    })
    after(() => client.close())

    client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
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
  })

  await t.completed
})
