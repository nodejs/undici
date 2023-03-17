'use strict'

const { test } = require('tap')
const { fetch } = require('../..')
const { createServer } = require('http')
const { once } = require('events')

test('issue 2009', async (t) => {
  const server = createServer((req, res) => {
    res.setHeader('a', 'b')
    res.flushHeaders()

    res.socket.end()
  }).listen(0)

  t.teardown(server.close.bind(server))
  await once(server, 'listening')

  for (let i = 0; i < 10; i++) {
    await t.resolves(
      fetch(`http://localhost:${server.address().port}`).then(
        async (resp) => {
          await resp.body.cancel('Some message')
        }
      )
    )
  }
})
