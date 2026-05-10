'use strict'

const { LOOPBACK_HOST } = require('./utils/node-http')
const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const {
  Pool,
  Client,
  Agent,
  request,
  errors
} = require('..')

// https://github.com/nodejs/undici/issues/1270

test('Pool.request() throws if opts.dispatcher is provided', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end('ok')
  })

  server.listen(0)
  await once(server, 'listening')

  after(async () => {
    server.close()
    await once(server, 'close')
  })

  const pool = new Pool(`http://${LOOPBACK_HOST}:${server.address().port}`)
  after(() => pool.close())

  const otherAgent = new Agent()
  after(() => otherAgent.close())

  try {
    await pool.request({
      path: '/',
      method: 'GET',
      dispatcher: otherAgent
    })
    t.fail('should have thrown')
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
    t.ok(err.message.includes('opts.dispatcher is not supported'))
  }
})

test('Client.request() throws if opts.dispatcher is provided', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end('ok')
  })

  server.listen(0)
  await once(server, 'listening')

  after(async () => {
    server.close()
    await once(server, 'close')
  })

  const client = new Client(`http://${LOOPBACK_HOST}:${server.address().port}`)
  after(() => client.close())

  const otherPool = new Pool(`http://${LOOPBACK_HOST}:${server.address().port}`)
  after(() => otherPool.close())

  try {
    await client.request({
      path: '/',
      method: 'GET',
      dispatcher: otherPool
    })
    t.fail('should have thrown')
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
    t.ok(err.message.includes('opts.dispatcher is not supported'))
  }
})

test('Top-level request() still works with opts.dispatcher', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end('hello')
  })

  server.listen(0)
  await once(server, 'listening')

  const pool = new Pool(`http://${LOOPBACK_HOST}:${server.address().port}`)

  after(async () => {
    await pool.close()
    server.close()
    await once(server, 'close')
  })

  const { statusCode, body } = await request(`http://${LOOPBACK_HOST}:${server.address().port}`, {
    method: 'GET',
    dispatcher: pool
  })

  t.equal(statusCode, 200)
  t.equal(await body.text(), 'hello')
})
