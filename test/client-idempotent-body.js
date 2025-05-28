'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { Client } = require('..')
const { createServer } = require('node:http')

test('idempotent retry', async (t) => {
  t = tspl(t, { plan: 11 })

  const body = 'world'
  const server = createServer((req, res) => {
    let buf = ''
    req.on('data', data => {
      buf += data
    }).on('end', () => {
      t.strictEqual(buf, body)
      res.end()
    })
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 2
    })
    after(() => client.close())

    const _err = new Error()

    for (let n = 0; n < 4; ++n) {
      client.stream({
        path: '/',
        method: 'PUT',
        idempotent: true,
        blocking: false,
        body
      }, () => {
        throw _err
      }, (err) => {
        t.strictEqual(err, _err)
      })
    }
  })

  await t.completed
})
