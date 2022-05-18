'use strict'

const { test } = require('tap')
const { Client } = require('..')
const { createServer } = require('http')

test('idempotent retry', (t) => {
  t.plan(11)

  const body = 'world'
  const server = createServer((req, res) => {
    let buf = ''
    req.on('data', data => {
      buf += data
    }).on('end', () => {
      t.strictSame(buf, body)
      res.end()
    })
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 2
    })
    t.teardown(client.close.bind(client))

    const _err = new Error()

    for (let n = 0; n < 4; ++n) {
      client.stream({
        path: '/',
        method: 'PUT',
        idempotent: true,
        body
      }, () => {
        throw _err
      }, (err) => {
        t.equal(err, _err)
      })
    }
  })
})
