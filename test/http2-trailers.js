'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createSecureServer } = require('node:http2')
const { once } = require('node:events')

const pem = require('@metcoder95/https-pem')

const { Client } = require('..')

test('Should handle http2 trailers', async t => {
  t = tspl(t, { plan: 1 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))

  server.on('stream', (stream, headers) => {
    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': headers['x-my-header'],
      ':status': 200
    },
    {
      waitForTrailers: true
    })

    stream.on('wantTrailers', () => {
      stream.sendTrailers({
        'x-trailer': 'hello'
      })
    })

    stream.end('hello h2!')
  })

  after(() => server.close())
  await once(server.listen(0, '127.0.0.1'), 'listening')

  const client = new Client(`https://${server.address().address}:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })
  after(() => client.close())

  client.dispatch({
    path: '/',
    method: 'PUT',
    body: 'hello'
  }, {
    onRequestStart () {},
    onResponseStart () {},
    onResponseData () {},
    onResponseEnd (_controller, trailers) {
      t.strictEqual(trailers['x-trailer'], 'hello')
    },
    onResponseError (_controller, err) {
      t.ifError(err)
    }
  })

  await t.completed
})
