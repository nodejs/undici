'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test } = require('node:test')
const { Client } = require('..')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { Readable } = require('node:stream')
const EE = require('node:events')

function closeServer (server) {
  return new Promise(resolve => {
    server.closeAllConnections?.()
    server.close(resolve)
  })
}

test('stream body without destroy', async (t) => {
  const ctx = t
  t = tspl(t, { plan: 2 })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end()
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`http://localhost:${server.address().port}`)
  ctx.after(async () => {
    await client.destroy()
    await closeServer(server)
  })

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
  }, (err) => {
    t.ok(err)
  })
  signal.emit('abort')

  await t.completed
})

test('IncomingMessage', async (t) => {
  const ctx = t
  t = tspl(t, { plan: 2 })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end()
  })
  server.listen(0)
  await once(server, 'listening')

  const proxyClient = new Client(`http://localhost:${server.address().port}`)
  proxyClient.on('disconnect', () => {
    if (!proxyClient.closed && !proxyClient.destroyed) {
      t.fail('unexpected disconnect')
    }
  })

  const proxy = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    proxyClient.request({
      path: '/',
      method: 'PUT',
      body: req
    }, (err, data) => {
      t.ifError(err)
      if (err) {
        res.destroy(err)
        return
      }

      data.body.pipe(res)
    })
  })
  proxy.listen(0)
  await once(proxy, 'listening')

  const client = new Client(`http://localhost:${proxy.address().port}`)
  client.on('disconnect', () => {
    if (!client.closed && !client.destroyed) {
      t.fail('unexpected disconnect')
    }
  })

  ctx.after(async () => {
    await client.destroy()
    await proxyClient.destroy()
    await closeServer(proxy)
    await closeServer(server)
  })

  await new Promise((resolve, reject) => {
    client.request({
      path: '/',
      method: 'PUT',
      body: 'hello world'
    }, (err, data) => {
      t.ifError(err)
      if (err) {
        reject(err)
        return
      }

      data.body.dump().then(resolve, reject)
    })
  })

  await t.completed
})
