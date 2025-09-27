'use strict'

const { test } = require('node:test')
const events = require('node:events')
const http = require('node:http')
const undici = require('../../')
const { closeServerAsPromise } = require('../utils/node-http')

const nodeBuild = require('../../undici-fetch.js')

test('user-agent defaults correctly', async (t) => {
  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
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

  t.assert.strictEqual(nodeBuildJSON.userAgentHeader, 'node')
  t.assert.strictEqual(undiciJSON.userAgentHeader, 'undici')
})

test('set user-agent for fetch', async (t) => {
  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end(JSON.stringify({ userAgentHeader: req.headers['user-agent'] }))
  })
  t.after(closeServerAsPromise(server))

  server.listen(0)
  await events.once(server, 'listening')
  const url = `http://localhost:${server.address().port}`
  const [nodeBuildJSON, undiciJSON] = await Promise.all([
    nodeBuild.fetch(url, { headers: { 'user-agent': 'AcmeCo Crawler - acme.co - node@acme.co' } }).then((body) => body.json()),
    undici.fetch(url, {
      headers: { 'user-agent': 'AcmeCo Crawler - acme.co - undici@acme.co' }
    }).then((body) => body.json())
  ])

  t.assert.strictEqual(nodeBuildJSON.userAgentHeader, 'AcmeCo Crawler - acme.co - node@acme.co')
  t.assert.strictEqual(undiciJSON.userAgentHeader, 'AcmeCo Crawler - acme.co - undici@acme.co')
})
