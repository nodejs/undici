'use strict'

const { test } = require('tap')
const { Client } = require('..')
const { createServer } = require('http')
const EE = require('events')

test('stream body without destroy', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.end()
  })
  t.teardown(server.close.bind(server))
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    const signal = new EE()
    const body = new EE()
    body.on('error', (err) => {
      t.ok(err)
    })
    client.request({
      path: '/',
      method: 'PUT',
      signal,
      body
    }, (err, data) => {
      t.ok(err)
    })
    signal.emit('abort')
  })
})

test('IncomingMessage', { only: true }, (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.end()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const proxyClient = new Client(`http://localhost:${server.address().port}`)
    t.teardown(proxyClient.destroy.bind(proxyClient))

    const proxy = createServer((req, res) => {
      proxyClient.request({
        path: '/',
        method: 'PUT',
        body: req
      }, (err, data) => {
        t.error(err)
        data.body.pipe(res)
      })
    })
    t.teardown(proxy.close.bind(proxy))

    proxy.listen(0, () => {
      const client = new Client(`http://localhost:${proxy.address().port}`)
      t.teardown(client.destroy.bind(client))

      client.request({
        path: '/',
        method: 'PUT',
        body: 'hello world'
      }, (err, data) => {
        t.error(err)
      })
    })
  })
})
