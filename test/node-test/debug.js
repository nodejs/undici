'use strict'

const { test } = require('node:test')
const { spawn } = require('node:child_process')
const { join } = require('node:path')
const { tspl } = require('@matteo.collina/tspl')

test('debug#websocket', async t => {
  const assert = tspl(t, { plan: 5 })
  const child = spawn(
    process.execPath,
    [join(__dirname, '../fixtures/websocket.js')],
    {
      env: {
        NODE_DEBUG: 'websocket'
      }
    }
  )
  const chunks = []
  const assertions = [
    /(WEBSOCKET [0-9]+:) (connecting to)/,
    // Skip the chunk that comes with the experimental warning
    /(\[UNDICI-WS\])/,
    /(WEBSOCKET [0-9]+:) (connected to)/,
    /(WEBSOCKET [0-9]+:) (sending request)/,
    /(WEBSOCKET [0-9]+:) (connection opened)/,
    /(WEBSOCKET [0-9]+:) (closed connection to)/
  ]

  t.after(() => {
    child.kill()
  })

  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => {
    chunks.push(chunk)
  })
  child.stderr.on('end', () => {
    for (let i = 1; i < chunks.length; i++) {
      assert.match(chunks[i], assertions[i])
    }
  })

  await assert.completed
})

test('debug#fetch', async t => {
  const assert = tspl(t, { plan: 5 })
  const child = spawn(
    process.execPath,
    [join(__dirname, '../fixtures/fetch.js')],
    {
      env: Object.assign({}, process.env, { NODE_DEBUG: 'fetch' })
    }
  )
  const chunks = []
  const assertions = [
    /(FETCH [0-9]+:) (connecting to)/,
    /(FETCH [0-9]+:) (connected to)/,
    /(FETCH [0-9]+:) (sending request)/,
    /(FETCH [0-9]+:) (received response)/,
    /(FETCH [0-9]+:) (trailers received)/
  ]

  t.after(() => {
    child.kill()
  })

  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => {
    chunks.push(chunk)
  })
  child.stderr.on('end', () => {
    for (let i = 0; i < chunks.length; i++) {
      assert.match(chunks[i], assertions[i])
    }
  })

  await assert.completed
})

test('debug#undici', async t => {
  // Due to Node.js webpage redirect
  const assert = tspl(t, { plan: 5 })
  const child = spawn(
    process.execPath,
    [join(__dirname, '../fixtures/undici.js')],
    {
      env: {
        NODE_DEBUG: 'undici'
      }
    }
  )
  const chunks = []
  const assertions = [
    /(UNDICI [0-9]+:) (connecting to)/,
    /(UNDICI [0-9]+:) (connected to)/,
    /(UNDICI [0-9]+:) (sending request)/,
    /(UNDICI [0-9]+:) (received response)/,
    /(UNDICI [0-9]+:) (trailers received)/
  ]

  t.after(() => {
    child.kill()
  })

  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => {
    chunks.push(chunk)
  })
  child.stderr.on('end', () => {
    for (let i = 0; i < chunks.length; i++) {
      assert.match(chunks[i], assertions[i])
    }
  })

  await assert.completed
})
