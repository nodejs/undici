'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createSecureServer } = require('node:http2')
const { once } = require('node:events')

const pem = require('@metcoder95/https-pem')

const { Client } = require('..')

test('Should throw informational error on half-closed streams (remote)', async t => {
  t = tspl(t, { plan: 2 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))

  server.on('stream', (stream, headers) => {
    stream.destroy()
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })
  after(() => client.close())

  await t.rejects(client
    .request({
      path: '/',
      method: 'GET'
    }), {
    message: 'HTTP/2: stream half-closed (remote)',
    code: 'UND_ERR_INFO'
  })
  await t.rejects(client
    .request({
      path: '/',
      method: 'GET'
    }), {
    message: 'HTTP/2: stream half-closed (remote)',
    code: 'UND_ERR_INFO'
  })

  await t.completed
})
