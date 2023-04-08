'use strict'

const { test } = require('tap')
const { fetch } = require('..')
const { createServer } = require('http')

test('do not leak', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.end()
  })
  t.teardown(server.close.bind(server))

  let url
  let done = false
  server.listen(0, function attack () {
    if (done) {
      return
    }
    url ??= new URL(`http://127.0.0.1:${server.address().port}`)
    const controller = new AbortController()
    fetch(url, { signal: controller.signal })
      .then(res => res.arrayBuffer())
      .then(attack)
  })

  let prev = Infinity
  let count = 0
  const interval = setInterval(() => {
    done = true
    global.gc()
    const next = process.memoryUsage().heapUsed
    if (next <= prev) {
      t.pass()
    } else if (count++ > 10) {
      t.fail()
    } else {
      prev = next
    }
  }, 1e3)
  t.teardown(() => clearInterval(interval))
})
