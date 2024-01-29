'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const events = require('node:events')
const http = require('node:http')
const undici = require('../../')
const { closeServerAsPromise } = require('../utils/node-http')

const nodeBuild = require('../../undici-fetch.js')

test('user-agent defaults correctly', async (t) => {
  const server = http.createServer((req, res) => {
    res.end(JSON.stringify({ userAgentHeader: req.headers['user-agent'] }))
  })
  t.after(closeServerAsPromise(server))

  server.listen(0)
  await events.once(server, 'listening')
  const url = `http://localhost:${server.address().port}`
  const [nodeBuildJSON, undiciJSON] = await Promise.all([
    nodeBuild.fetch(url).then((body) => body.json()),
    undici.fetch(url).then((body) => body.json())
  ])

  assert.strictEqual(nodeBuildJSON.userAgentHeader, 'node')
  assert.strictEqual(undiciJSON.userAgentHeader, 'undici')
})
