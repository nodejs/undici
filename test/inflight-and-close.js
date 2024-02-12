'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test } = require('node:test')
const { request } = require('..')
const http = require('node:http')

test('inflight and close', async (t) => {
  t = tspl(t, { plan: 3 })

  const server = http.createServer((req, res) => {
    res.writeHead(200)
    res.end('Response body')
    res.socket.end() // Close the connection immediately with every response
  }).listen(0, '127.0.0.1', function () {
    const url = `http://127.0.0.1:${this.address().port}`
    request(url)
      .then(({ statusCode, headers, body }) => {
        t.ok(true, 'first response')
        body.resume()
        body.on('close', function () {
          t.ok(true, 'first body closed')
        })
        return request(url)
          .then(({ statusCode, headers, body }) => {
            t.ok(true, 'second response')
            body.resume()
            body.on('close', function () {
              server.close()
            })
          })
      }).catch((err) => {
        t.ifError(err)
      })
  })
  await t.completed
})
