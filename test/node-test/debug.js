'use strict'

const { test } = require('node:test')
const { spawn } = require('node:child_process')
const { join } = require('node:path')
const { tspl } = require('@matteo.collina/tspl')

// eslint-disable-next-line no-control-regex
const removeEscapeColorsRE = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g

const isNode23Plus = process.versions.node.split('.')[0] >= 23
const isCITGM = !!process.env.CITGM

test('debug#websocket', { skip: !process.versions.icu || isCITGM || isNode23Plus }, async t => {
  const assert = tspl(t, { plan: 6 })
  const child = spawn(
    process.execPath,
    [
      '--no-experimental-fetch',
      join(__dirname, '../fixtures/websocket.js')],
    {
      env: {
        NODE_DEBUG: 'websocket'
      }
    }
  )
  const chunks = []
  const assertions = [
    /(WEBSOCKET [0-9]+:) (connecting to)/,
    /(WEBSOCKET [0-9]+:) (connected to)/,
    /(WEBSOCKET [0-9]+:) (sending request)/,
    /(WEBSOCKET [0-9]+:) (connection opened)/,
    /(WEBSOCKET [0-9]+:) (closed connection to)/,
    /^$/
  ]

  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => {
    chunks.push(chunk)
  })
  child.stderr.on('end', () => {
    const lines = extractLines(chunks)
    assert.strictEqual(lines.length, assertions.length)
    for (let i = 1; i < lines.length; i++) {
      assert.match(lines[i], assertions[i])
    }
  })

  await assert.completed
})

test('debug#fetch', { skip: isCITGM || isNode23Plus }, async t => {
  const assert = tspl(t, { plan: 7 })
  const child = spawn(
    process.execPath,
    [
      '--no-experimental-fetch',
      join(__dirname, '../fixtures/fetch.js')
    ],
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
    /(FETCH [0-9]+:) (trailers received)/,
    /^$/
  ]

  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => {
    chunks.push(chunk)
  })
  child.stderr.on('end', () => {
    const lines = extractLines(chunks)
    assert.strictEqual(lines.length, assertions.length)
    for (let i = 0; i < lines.length; i++) {
      assert.match(lines[i], assertions[i])
    }
  })

  await assert.completed
})

test('debug#undici', { skip: isCITGM || isNode23Plus }, async t => {
  // Due to Node.js webpage redirect
  const assert = tspl(t, { plan: 7 })
  const child = spawn(
    process.execPath,
    [
      '--no-experimental-fetch',
      join(__dirname, '../fixtures/undici.js')
    ],
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
    /(UNDICI [0-9]+:) (trailers received)/,
    /^$/
  ]

  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => {
    chunks.push(chunk)
  })
  child.stderr.on('end', () => {
    const lines = extractLines(chunks)
    assert.strictEqual(lines.length, assertions.length)
    for (let i = 0; i < lines.length; i++) {
      assert.match(lines[i], assertions[i])
    }
  })

  await assert.completed
})

function extractLines (chunks) {
  return chunks
    .join('')
    .split('\n')
    .map(v => v.replace(removeEscapeColorsRE, ''))
}
