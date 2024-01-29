'use strict'

const { test } = require('tap')
const { Client } = require('..')
const { createServer } = require('node:http')
const { Readable } = require('node:stream')

test('request timeout with slow readable body', (t) => {
  t.plan(1)

  const server = createServer(async (req, res) => {
    let str = ''
    for await (const x of req) {
      str += x
    }
    res.end(str)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, { headersTimeout: 50 })
    t.teardown(client.close.bind(client))

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
      t.error(err)
      await response.body.dump()
    })
  })
})
