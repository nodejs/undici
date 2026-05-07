'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { request } = require('..')
const http = require('node:http')
const { once } = require('node:events')

test('inflight and close', async (t) => {
  t = tspl(t, { plan: 3 })

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.writeHead(200)
    res.end('Response body')
    res.socket.end() // Close the connection immediately with every response
  })

  after(() => server.close())

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')

  const url = `http://127.0.0.1:${server.address().port}`

  const first = await request(url)
  t.ok(true, 'first response')

  const firstBodyClosed = once(first.body, 'close').then(() => {
    t.ok(true, 'first body closed')
  })
  first.body.resume()

  const second = await request(url)
  t.ok(true, 'second response')

  const secondBodyClosed = once(second.body, 'close')
  second.body.resume()

  await Promise.all([
    firstBodyClosed,
    secondBodyClosed
  ])

  await t.completed
})
