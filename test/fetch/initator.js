'use strict'

const { test, describe, before, after } = require('node:test')
const assert = require('node:assert')
const events = require('node:events')
const http = require('node:http')
const { fetch, Request } = require('../../')
const { closeServerAsPromise } = require('../utils/node-http')

describe('initiator', () => {
  const server = http.createServer((req, res) => {
    res.end(req.headers['sec-purpose'])
  })

  before(async () => {
    server.listen(0)
    await events.once(server, 'listening')
  })

  after(closeServerAsPromise(server))

  test('if initiator is not "prefetch" then sec-purpose is not set', async (t) => {
    const url = `http://localhost:${server.address().port}`

    const response = await fetch(url, {
      initiator: ''
    })

    assert.strictEqual(await response.text(), '')
  })

  test('if initiator is set to prefetch then the sec-purpose header is set to "prefetch"', async (t) => {
    const url = `http://localhost:${server.address().port}`

    const response = await fetch(new Request(url, {
      initiator: 'prefetch'
    }))

    assert.deepStrictEqual(await response.text(), 'prefetch')
  })
})
