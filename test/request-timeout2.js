'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { once } = require('node:events')
const { Client } = require('..')
const { createServer } = require('node:http')
const { Readable } = require('node:stream')

test('request timeout with slow readable body', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer(async (req, res) => {
    let str = ''
    for await (const x of req) {
      str += x
    }
    res.end(str)
  })
  after(() => server.close())

  server.listen(0)

  await once(server, 'listening')
  const client = new Client(`http://localhost:${server.address().port}`, { headersTimeout: 50 })
  after(() => client.close())

  const body = new Readable({
    read () {
      if (this._reading) {
        return
      }
      this._reading = true

      this.push('asd')
      setTimeout(() => {
        this.push('asd')
        this.push(null)
      }, 2e3)
    }
  })
  client.request({
    path: '/',
    method: 'POST',
    headersTimeout: 1e3,
    body
  }, async (err, response) => {
    t.ifError(err)
    await response.body.dump()
  })

  await t.completed
})
