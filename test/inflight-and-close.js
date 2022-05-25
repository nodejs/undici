'use strict'

const t = require('tap')
const { request } = require('..')
const http = require('http')

const server = http.createServer((req, res) => {
  res.writeHead(200)
  res.end('Response body')
  res.socket.end() // Close the connection immediately with every response
}).listen(0, '127.0.0.1', function () {
  const url = `http://127.0.0.1:${this.address().port}`
  request(url)
    .then(({ statusCode, headers, body }) => {
      t.pass('first response')
      body.resume()
      body.on('close', function () {
        t.pass('first body closed')
      })
      return request(url)
        .then(({ statusCode, headers, body }) => {
          t.pass('second response')
          body.resume()
          body.on('close', function () {
            server.close()
          })
        })
    }).catch((err) => {
      t.error(err)
    })
})
