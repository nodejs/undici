'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test } = require('node:test')
const { Client } = require('..')
const { kHTTP2Options } = require('../lib/core/symbols')

test('h2Options.maxConcurrentStreams is validated on its own value', async (t) => {
  t = tspl(t, { plan: 4 })

  const client = new Client('https://localhost', {
    h2Options: { maxConcurrentStreams: 10 }
  })
  t.strictEqual(client[kHTTP2Options].maxConcurrentStreams, 10)
  await client.close()

  const withWindow = new Client('https://localhost', {
    h2Options: { maxConcurrentStreams: 10, connectionWindowSize: 65535 }
  })
  t.strictEqual(withWindow[kHTTP2Options].maxConcurrentStreams, 10)
  await withWindow.close()

  t.throws(() => new Client('https://localhost', {
    h2Options: { maxConcurrentStreams: 'not-a-number', connectionWindowSize: 65535 }
  }), { code: 'UND_ERR_INVALID_ARG' })

  t.throws(() => new Client('https://localhost', {
    h2Options: { maxConcurrentStreams: 0 }
  }), { code: 'UND_ERR_INVALID_ARG' })
})

test('h2Options.settings.initialWindowSize reaches the session options', async (t) => {
  t = tspl(t, { plan: 2 })

  const client = new Client('https://localhost', {
    h2Options: { settings: { initialWindowSize: 131072 } }
  })
  t.strictEqual(client[kHTTP2Options].sessionOptions.initialWindowSize, 131072)
  await client.close()

  const defaulted = new Client('https://localhost', { h2Options: {} })
  t.strictEqual(defaulted[kHTTP2Options].sessionOptions.initialWindowSize, 262144)
  await defaulted.close()
})
