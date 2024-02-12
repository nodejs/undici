'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { once } = require('node:events')
const { Client } = require('..')
const { createServer } = require('node:http')
const { Blob } = require('node:buffer')

test('request post blob', { skip: !Blob }, async (t) => {
  t = tspl(t, { plan: 3 })

  const server = createServer(async (req, res) => {
    t.strictEqual(req.headers['content-type'], 'application/json')
    let str = ''
    for await (const chunk of req) {
      str += chunk
    }
    t.strictEqual(str, 'asd')
    res.end()
  })
  after(server.close.bind(server))

  server.listen(0)

  await once(server, 'listening')

  const client = new Client(`http://localhost:${server.address().port}`)
  after(client.destroy.bind(client))

  client.request({
    path: '/',
    method: 'GET',
    body: new Blob(['asd'], {
      type: 'application/json'
    })
  }, (err, data) => {
    t.ifError(err)
    data.body.resume().on('end', () => {
      t.end()
    })
  })
  await t.completed
})

test('request post arrayBuffer', { skip: !Blob }, async (t) => {
  t = tspl(t, { plan: 3 })

  const server = createServer(async (req, res) => {
    let str = ''
    for await (const chunk of req) {
      str += chunk
    }
    t.strictEqual(str, 'asd')
    res.end()
  })

  after(() => server.close())

  server.listen(0)

  await once(server, 'listening')

  const client = new Client(`http://localhost:${server.address().port}`)
  after(() => client.destroy())

  const buf = Buffer.from('asd')
  const dst = new ArrayBuffer(buf.byteLength)
  buf.copy(new Uint8Array(dst))

  client.request({
    path: '/',
    method: 'GET',
    body: dst
  }, (err, data) => {
    t.ifError(err)
    data.body.resume().on('end', () => {
      t.ok(true, 'pass')
    })
  })

  await t.completed
})
