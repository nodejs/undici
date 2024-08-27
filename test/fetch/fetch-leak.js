'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { tspl } = require('@matteo.collina/tspl')
const { fetch } = require('../..')
const { createServer } = require('node:http')
const { closeServerAsPromise } = require('../utils/node-http')

const hasGC = typeof global.gc !== 'undefined'

test('do not leak', (t, done) => {
  if (!hasGC) {
    throw new Error('gc is not available. Run with \'--expose-gc\'.')
  }
  const { ok } = tspl(t, { plan: 1 })
  const server = createServer((req, res) => {
    res.end()
  })
  t.after(closeServerAsPromise(server))

  let url
  let isDone = false
  server.listen(0, function attack () {
    if (isDone) {
      return
    }
    url ??= new URL(`http://127.0.0.1:${server.address().port}`)
    const controller = new AbortController()
    fetch(url, { signal: controller.signal })
      .then(res => res.arrayBuffer())
      .catch(() => {})
      .then(attack)
  })

  let prev = Infinity
  let count = 0
  const interval = setInterval(() => {
    isDone = true
    global.gc()
    const next = process.memoryUsage().heapUsed
    if (next <= prev) {
      ok(true)
      done()
    } else if (count++ > 20) {
      assert.fail()
    } else {
      prev = next
    }
  }, 1e3)
  t.after(() => clearInterval(interval))
})
