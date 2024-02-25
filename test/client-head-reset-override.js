'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { test, after } = require('node:test')
const { Client } = require('..')

test('override HEAD reset', async (t) => {
  t = tspl(t, { plan: 4 })

  const expected = 'testing123'
  const server = createServer((req, res) => {
    if (req.method === 'GET') {
      res.write(expected)
    }
    res.end()
  }).listen(0)

  after(() => server.close())

  await once(server, 'listening')
  const client = new Client(`http://localhost:${server.address().port}`)
  after(() => client.close())

  let done
  client.on('disconnect', () => {
    if (!done) {
      t.fail()
    }
  })

  client.request({
    path: '/',
    method: 'HEAD',
    reset: false
  }, (err, res) => {
    t.ifError(err)
    res.body.resume()
  })

  client.request({
    path: '/',
    method: 'HEAD',
    reset: false
  }, (err, res) => {
    t.ifError(err)
    res.body.resume()
  })

  client.request({
    path: '/',
    method: 'GET',
    reset: false
  }, (err, res) => {
    t.ifError(err)
    let str = ''
    res.body.on('data', (data) => {
      str += data
    }).on('end', () => {
      t.strictEqual(str, expected)
      done = true
      t.end()
    })
  })

  await t.completed
})
