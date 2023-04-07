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

  const xs = []
  const interval = setInterval(() => {
    global.gc()
    xs.push(process.memoryUsage().heapUsed)
    if (xs.length > 5) {
      done = true
      const final = xs.pop() // compare against final value
      xs.splice(2) // skip first two values, memory can still be growing
      t.ok(xs.every(x => final - x < 1e6))
    }
  }, 1e3)
  t.teardown(() => clearInterval(interval))
})
