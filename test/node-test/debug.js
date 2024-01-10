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

  t.after(() => {
    child.kill()
  })

  child.stderr.setEncoding('utf8')

  for await (const chunk of child.stderr) {
    if (chunk.includes('[UNDICI-WS] Warning')) {
      continue
    }

    assert.match(
      chunk,
      /(WEBSOCKET [0-9]+:) (connecting to|connected to|sending request|connection opened|closed connection)/
    )
  }
})

test('debug#fetch', async t => {
  // Due to Node.js webpage redirect
  const assert = tspl(t, { plan: 10 })
  const child = spawn(
    process.execPath,
    [join(__dirname, '../fixtures/fetch.js')],
    {
      env: {
        NODE_DEBUG: 'fetch'
      }
    }
  )

  t.after(() => {
    child.kill()
  })

  child.stderr.setEncoding('utf8')

  for await (const chunk of child.stderr) {
    assert.match(
      chunk,
      /(FETCH [0-9]+:) (connecting to|connected to|sending request|received response|trailers received|request to)/
    )
  }
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

  t.after(() => {
    child.kill()
  })

  child.stderr.setEncoding('utf8')

  for await (const chunk of child.stderr) {
    assert.match(
      chunk,
      /(UNDICI [0-9]+:) (connecting to|connected to|sending request|received response|trailers received|request to)/
    )
  }
})
