'use strict'

const { test } = require('tap')
const { Client } = require('..')
const { PassThrough } = require('node:stream')

test(t => {
  t.plan(2)

  const client = new Client('http://localhost:1234', {
    connect: (_, cb) => {
      client.destroy()
      cb(null, new PassThrough({
        destroy (err, cb) {
          t.same(err?.name, 'ClientDestroyedError')
          cb(null)
        }
      }))
    }
  })

  client.request({
    path: '/',
    method: 'GET'
  }, (err, data) => {
    t.same(err?.name, 'ClientDestroyedError')
  })
})
