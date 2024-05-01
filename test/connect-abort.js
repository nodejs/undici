'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test } = require('node:test')
const { Client } = require('..')
const { PassThrough } = require('node:stream')

test('connect-abort', async t => {
  t = tspl(t, { plan: 2 })

  const client = new Client('http://localhost:1234', {
    connect: (_, cb) => {
      client.destroy()
      cb(null, new PassThrough({
        destroy (err, cb) {
          t.strictEqual(err.name, 'ClientDestroyedError')
          cb(null)
        }
      }))
    }
  })

  client.request({
    path: '/',
    method: 'GET'
  }, (err, data) => {
    t.strictEqual(err.name, 'ClientDestroyedError')
  })

  await t.completed
})
