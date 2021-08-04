'use strict'

const { test } = require('tap')
const { Client } = require('..')
const { createServer } = require('http')
const { Blob } = require('buffer')

test('request post blob', { skip: !Blob }, (t) => {
  t.plan(4)

  const server = createServer(async (req, res) => {
    t.equal(req.headers['content-type'], 'application/json')
    let str = ''
    for await (const chunk of req) {
      str += chunk
    }
    t.equal(str, 'asd')
    res.end()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET',
      body: new Blob(['asd'], {
        type: 'application/json'
      })
    }, (err, data) => {
      console.error(err)
      t.error(err)
      data.body.resume().on('end', () => {
        t.pass()
      })
    })
  })
})
