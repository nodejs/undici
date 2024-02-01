'use strict'

const { test } = require('node:test')
const { tspl } = require('@matteo.collina/tspl')
const { fetch } = require('../..')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { closeServerAsPromise } = require('../utils/node-http')

test('issue 2009', async (t) => {
  const { doesNotReject } = tspl(t, { plan: 10 })

  const server = createServer((req, res) => {
    res.setHeader('a', 'b')
    res.flushHeaders()

    res.socket.end()
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  for (let i = 0; i < 10; i++) {
    await doesNotReject(
      fetch(`http://localhost:${server.address().port}`).then(
        async (resp) => {
          await resp.body.cancel('Some message')
        }
      )
    )
  }
})
