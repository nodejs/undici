'use strict'

const { test } = require('tap')
const { Client } = require('..')
const { createServer } = require('node:http')
const { Blob } = require('node:buffer')

test('request post blob', { skip: !Blob }, (t) => {
  t.plan(4)

  const server = createServer(async (req, res) => {
    t.equal(req.headers['content-type'], 'application/json')
    let str = ''
    for await (const chunk of req) {
      str += chunk
    }
    t.equal(str, 'asd')
    res.end()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET',
      body: new Blob(['asd'], {
        type: 'application/json'
      })
    }, (err, data) => {
      t.error(err)
      data.body.resume().on('end', () => {
        t.pass()
      })
    })
  })
})

test('request post arrayBuffer', { skip: !Blob }, (t) => {
  t.plan(3)

  const server = createServer(async (req, res) => {
    let str = ''
    for await (const chunk of req) {
      str += chunk
    }
    t.equal(str, 'asd')
    res.end()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    const buf = Buffer.from('asd')
    const dst = new ArrayBuffer(buf.byteLength)
    buf.copy(new Uint8Array(dst))

    client.request({
      path: '/',
      method: 'GET',
      body: dst
    }, (err, data) => {
      t.error(err)
      data.body.resume().on('end', () => {
        t.pass()
      })
    })
  })
})
