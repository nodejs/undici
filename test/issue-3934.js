'use strict'

const { test } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const assert = require('node:assert')
const { Agent, RetryAgent, request } = require('..')

// https://github.com/nodejs/undici/issues/3934
test('WrapHandler works with multiple header values', async (t) => {
  const server = createServer(async (_req, res) => {
    const headers = [
      ['set-cookie', 'a'],
      ['set-cookie', 'b'],
      ['set-cookie', 'c']
    ]
    res.writeHead(200, headers)
    res.end()
  }).listen(0)

  await once(server, 'listening')
  t.after(() => server.close())

  const agent = new Agent()
  const retryAgent = new RetryAgent(agent)

  const {
    headers
  } = await request(`http://localhost:${server.address().port}`, { dispatcher: retryAgent })

  assert.deepStrictEqual(headers['set-cookie'], ['a', 'b', 'c'])
})
