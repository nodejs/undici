'use strict'

const assert = require('node:assert')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { test } = require('node:test')
const { fetch } = require('../..')

test('Redirecting a bunch does not cause a MaxListenersExceededWarning', async (t) => {
  let redirects = 0

  const server = createServer((req, res) => {
    if (redirects === 15) {
      res.end('Okay goodbye')
      return
    }

    res.writeHead(302, {
      Location: `/${redirects++}`
    })
    res.end()
  }).listen(0)

  t.after(server.close.bind(server))
  await once(server, 'listening')

  process.emitWarning = assert.bind(null, false)

  const url = `http://localhost:${server.address().port}`
  const response = await fetch(url, { redirect: 'follow' })

  assert.deepStrictEqual(response.url, `${url}/${redirects - 1}`)
})
