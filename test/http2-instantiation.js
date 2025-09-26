'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createSecureServer } = require('node:http2')
const { once } = require('node:events')

const pem = require('@metcoder95/https-pem')

const { Client } = require('..')

test('Should throw if bad allowH2 has been passed', async t => {
  t = tspl(t, { plan: 1 })

  t.throws(() => {
    // eslint-disable-next-line
    new Client('https://localhost:1000', {
      allowH2: 'true'
    })
  }, {
    message: 'allowH2 must be a valid boolean value'
  })

  await t.completed
})

test('Should throw if bad maxConcurrentStreams has been passed', async t => {
  t = tspl(t, { plan: 2 })

  t.throws(() => {
    // eslint-disable-next-line
    new Client('https://localhost:1000', {
      allowH2: true,
      maxConcurrentStreams: {}
    })
  }, {
    message: 'maxConcurrentStreams must be a positive integer, greater than 0'
  })

  t.throws(() => {
    // eslint-disable-next-line
    new Client('https://localhost:1000', {
      allowH2: true,
      maxConcurrentStreams: -1
    })
  }, {
    message: 'maxConcurrentStreams must be a positive integer, greater than 0'
  })

  await t.completed
})

test(
  'Request should fail if allowH2 is false and server advertises h1 only',
  async t => {
    t = tspl(t, { plan: 1 })

    const server = createSecureServer(
      {
        ...await pem.generate({ opts: { keySize: 2048 } }),
        allowHTTP1: false,
        ALPNProtocols: ['http/1.1']
      },
      (req, res) => {
        t.fail('Should not create a valid h2 stream')
      }
    )

    after(() => server.close())
    await once(server.listen(0), 'listening')

    const client = new Client(`https://localhost:${server.address().port}`, {
      allowH2: false,
      connect: {
        rejectUnauthorized: false
      }
    })
    after(() => client.close())

    await t.rejects(client.request({
      path: '/',
      method: 'GET',
      headers: {
        'x-my-header': 'foo'
      }
    }))

    await t.completed
  })
