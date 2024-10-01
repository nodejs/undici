'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { describe, test } = require('node:test')

const timers = require('../lib/util/timers')

// timers.setTimeout implements a low resolution timer with a 500 ms granularity
// It is expected that in the worst case, a timer will fire about 500 ms after the
// intended amount of time, an extra 200 ms is added to account event loop overhead
// Timers should never fire excessively early, 1ms early is tolerated
const ACCEPTABLE_DELTA = 700n

describe('timers - acceptance', () => {
  const getDelta = (start, target) => {
    const end = process.hrtime.bigint()
    const actual = (end - start) / 1_000_000n
    return actual - BigInt(target)
  }

  test('meet acceptable resolution time', async (t) => {
    const testTimeouts = [0, 1, 499, 500, 501, 990, 999, 1000, 1001, 1100, 1400, 1499, 1500, 4000, 5000]

    t = tspl(t, { plan: 1 + testTimeouts.length * 2 })

    const start = process.hrtime.bigint()

    for (const target of testTimeouts) {
      timers.setTimeout(() => {
        const delta = getDelta(start, target)

        t.ok(delta >= -1n, `${target}ms fired early`)
        t.ok(delta < ACCEPTABLE_DELTA, `${target}ms fired late, got difference of ${delta}ms`)
      }, target)
    }

    setTimeout(() => t.ok(true), 6000)
    await t.completed
  })
})
