'use strict'

const { createServer } = require('http')
const { test } = require('tap')
const { Client } = require('..')

test('override HEAD reset', (t) => {
  const expected = 'testing123'
  const server = createServer((req, res) => {
    if (req.method === 'GET') {
      res.write(expected)
    }
    res.end()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

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
      t.error(err)
      res.body.resume()
    })

    client.request({
      path: '/',
      method: 'HEAD',
      reset: false
    }, (err, res) => {
      t.error(err)
      res.body.resume()
    })

    client.request({
      path: '/',
      method: 'GET',
      reset: false
    }, (err, res) => {
      t.error(err)
      let str = ''
      res.body.on('data', (data) => {
        str += data
      }).on('end', () => {
        t.same(str, expected)
        done = true
        t.end()
      })
    })
  })
})
