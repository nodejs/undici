'use strict'

const buffer = require('node:buffer')
const { test } = require('node:test')
const { Agent, Client, Pool } = require('../..')

test('Agent eventSourceOptions.maxEventSize is read correctly', async (t) => {
  const customLimit = 32 * 1024 * 1024
  const agent = new Agent({
    eventSource: {
      maxEventSize: customLimit
    }
  })

  t.after(() => agent.close())

  t.assert.strictEqual(agent.eventSourceOptions.maxEventSize, customLimit)
})

test('Agent with default eventSourceOptions uses buffer.kStringMaxLength', async (t) => {
  const agent = new Agent()

  t.after(() => agent.close())

  t.assert.strictEqual(agent.eventSourceOptions.maxEventSize, buffer.kStringMaxLength)
})

test('Client eventSourceOptions.maxEventSize is read correctly', async (t) => {
  const customLimit = 16 * 1024 * 1024
  const client = new Client('http://localhost', {
    eventSource: {
      maxEventSize: customLimit
    }
  })

  t.after(() => client.close())

  t.assert.strictEqual(client.eventSourceOptions.maxEventSize, customLimit)
})

test('Pool eventSourceOptions.maxEventSize is read correctly', async (t) => {
  const customLimit = 8 * 1024 * 1024
  const pool = new Pool('http://localhost', {
    eventSource: {
      maxEventSize: customLimit
    }
  })

  t.after(() => pool.close())

  t.assert.strictEqual(pool.eventSourceOptions.maxEventSize, customLimit)
})
