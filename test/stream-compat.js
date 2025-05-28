'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { Client } = require('..')
const { createServer } = require('node:http')
const { Readable } = require('node:stream')
const EE = require('node:events')

test('stream body without destroy', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    res.end()
  })
  after(() => server.close())
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

    const signal = new EE()
    const body = new Readable({ read () {} })
    body.destroy = undefined
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

  await t.completed
})

test('IncomingMessage', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    res.end()
  })
  after(() => server.close())

  server.listen(0, () => {
    const proxyClient = new Client(`http://localhost:${server.address().port}`)
    after(() => proxyClient.destroy())

    const proxy = createServer((req, res) => {
      proxyClient.request({
        path: '/',
        method: 'PUT',
        body: req
      }, (err, data) => {
        t.ifError(err)
        data.body.pipe(res)
      })
    })
    after(() => proxy.close())

    proxy.listen(0, () => {
      const client = new Client(`http://localhost:${proxy.address().port}`)
      after(() => client.destroy())

      client.request({
        path: '/',
        method: 'PUT',
        body: 'hello world'
      }, (err, data) => {
        t.ifError(err)
      })
    })
  })

  await t.completed
})
