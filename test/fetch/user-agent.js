'use strict'

const { test, skip } = require('tap')
const events = require('events')
const http = require('http')
const undici = require('../../')
const nodeBuild = require('../../undici-fetch.js')
const { nodeMajor } = require('../../lib/core/util')

if (nodeMajor === 16) {
  skip('esbuild uses static blocks with --keep-names which node 16.8 does not have')
  process.exit()
}

test('user-agent defaults correctly', async (t) => {
  const server = http.createServer((req, res) => {
    res.end(JSON.stringify({ userAgentHeader: req.headers['user-agent'] }))
  })
  t.teardown(server.close.bind(server))

  server.listen(0)
  await events.once(server, 'listening')
  const url = `http://localhost:${server.address().port}`
  const [nodeBuildJSON, undiciJSON] = await Promise.all([
    nodeBuild.fetch(url).then((body) => body.json()),
    undici.fetch(url).then((body) => body.json())
  ])

  t.same(nodeBuildJSON.userAgentHeader, 'node')
  t.same(undiciJSON.userAgentHeader, 'undici')
})
