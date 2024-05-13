'use strict'

const { test } = require('node:test')
const { fetch } = require('../..')
const { createServer } = require('node:http')
const { closeServerAsPromise } = require('../utils/node-http')
const tspl = require('@matteo.collina/tspl')

test('abort the request on the other side if the stream is canceled', async (t) => {
  const p = tspl(t, { plan: 1 })
  const server = createServer((req, res) => {
    res.writeHead(200)
    res.write('hello')
    req.on('aborted', () => {
      p.ok('aborted')
    })
    // Let's not end the response on purpose
  })
  t.after(closeServerAsPromise(server))

  await new Promise((resolve) => {
    server.listen(0, resolve)
  })

  const url = new URL(`http://127.0.0.1:${server.address().port}`)

  const response = await fetch(url)

  const reader = response.body.getReader()

  try {
    await reader.read()
  } finally {
    reader.releaseLock()
    await response.body.cancel()
  }

  await p.completed
})
