'use strict'

const { test, after } = require('node:test')
const { sep, basename, join } = require('node:path')
const { readFileSync } = require('node:fs')
const { createRequire } = require('node:module')
const { runInThisContext } = require('node:vm')
const { fetch, setGlobalDispatcher, getGlobalDispatcher, Agent } = require('../..')

const projectFolder = basename(join(__dirname, '..', '..'))
const { fetch: fetchIndex } = require('../../index-fetch')

const previousDispatcher = getGlobalDispatcher()
setGlobalDispatcher(new Agent({
  headersTimeout: 500,
  connectTimeout: 500
}))

after(() => {
  setGlobalDispatcher(previousDispatcher)
})

test('FETCH: request errors and prints trimmed stack trace', async (t) => {
  try {
    await fetch('http://a.com')
  } catch (error) {
    const stackLines = error.stack.split('\n')
    t.assert.ok(stackLines[0].includes('TypeError: fetch failed'))
    t.assert.ok(stackLines.some(line => line.includes(`lib${sep}web${sep}fetch${sep}index.js`)))
    t.assert.ok(stackLines.some(line => line.includes(`${projectFolder}${sep}index.js`)))
    t.assert.ok(stackLines.some(line => line.includes(__filename)))
  }
})

test('FETCH-index: request errors and prints trimmed stack trace', async (t) => {
  try {
    await fetchIndex('http://a.com')
  } catch (error) {
    const stackLines = error.stack.split('\n')
    t.assert.ok(stackLines[0].includes('TypeError: fetch failed'))
    t.assert.ok(stackLines.some(line => line.includes(`lib${sep}web${sep}fetch${sep}index.js`)))
    t.assert.ok(stackLines.some(line => line.includes(`${projectFolder}${sep}index-fetch.js`)))
    t.assert.ok(stackLines.some(line => line.includes(__filename)))
  }
})

test('FETCH-index: request errors keep their stack trace when __filename is undefined', async (t) => {
  // Node.js bundles index-fetch.js into a module wrapper without __filename
  const file = join(__dirname, '..', '..', 'index-fetch.js')
  const wrapper = runInThisContext(`(function (exports, require, module) {${readFileSync(file, 'utf8')}\n})`, { filename: file })
  const bundled = { exports: {} }
  wrapper(bundled.exports, createRequire(file), bundled)

  await t.assert.rejects(bundled.exports.fetch('http://localhost:1'), (error) => {
    const stackLines = error.stack.split('\n')
    t.assert.ok(stackLines[0].includes('TypeError: fetch failed'))
    t.assert.ok(stackLines.some(line => line.includes(__filename)))
    return true
  })
})
