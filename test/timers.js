'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { describe, test } = require('node:test')

const timers = require('../lib/util/timers')
const { eventLoopBlocker } = require('./utils/event-loop-blocker')

describe('timers', () => {
  test('timers exports a clearTimeout', (t) => {
    t = tspl(t, { plan: 1 })

    t.ok(typeof timers.clearTimeout === 'function')
  })

  test('timers exports a setTimeout', (t) => {
    t = tspl(t, { plan: 1 })

    t.ok(typeof timers.setTimeout === 'function')
  })

  test('setTimeout instantiates a native NodeJS.Timeout when delay is lower or equal 1e3 ms', (t) => {
    t = tspl(t, { plan: 2 })

    t.strictEqual(timers.setTimeout(() => { }, 999)[timers.kFastTimer], undefined)
    t.strictEqual(timers.setTimeout(() => { }, 1e3)[timers.kFastTimer], undefined)
  })

  test('setTimeout instantiates a FastTimer when delay is smaller than 1e3 ms', (t) => {
    t = tspl(t, { plan: 1 })

    const timeout = timers.setTimeout(() => { }, 1001)
    t.strictEqual(timeout[timers.kFastTimer], true)
  })

  test('clearTimeout can clear a node native Timeout', (t) => {
    t = tspl(t, { plan: 3 })

    const nativeTimeoutId = setTimeout(() => { }, 1e6)
    t.equal(nativeTimeoutId._idleTimeout, 1e6)
    t.ok(timers.clearTimeout(nativeTimeoutId) === undefined)
    t.equal(nativeTimeoutId._idleTimeout, -1)
  })

  test('a FastTimer will get a _idleStart value after short time', async (t) => {
    t = tspl(t, { plan: 3 })

    const timer = timers.setTimeout(() => {
      t.fail('timer should not have fired')
    }, 1e4)

    t.strictEqual(timer[timers.kFastTimer], true)
    t.strictEqual(timer._idleStart, -1)
    await new Promise((resolve) => setTimeout(resolve, 750))
    t.notStrictEqual(timer._idleStart, -1)

    timers.clearTimeout(timer)
  })

  test('a cleared FastTimer will reset the _idleStart value to -1', async (t) => {
    t = tspl(t, { plan: 4 })

    const timer = timers.setTimeout(() => {
      t.fail('timer should not have fired')
    }, 1e4)

    t.strictEqual(timer[timers.kFastTimer], true)
    t.strictEqual(timer._idleStart, -1)
    await new Promise((resolve) => setTimeout(resolve, 750))
    t.notStrictEqual(timer._idleStart, -1)
    timers.clearTimeout(timer)
    t.strictEqual(timer._idleStart, -1)
  })

  test('a FastTimer can be cleared', async (t) => {
    t = tspl(t, { plan: 3 })

    const timer = timers.setTimeout(() => {
      t.fail('timer should not have fired')
    }, 1001)

    t.strictEqual(timer[timers.kFastTimer], true)
    timers.clearTimeout(timer)

    t.strictEqual(timer._idleStart, -1)
    await new Promise((resolve) => setTimeout(resolve, 750))
    t.strictEqual(timer._idleStart, -1)
  })

  test('a cleared FastTimer can be refreshed', async (t) => {
    t = tspl(t, { plan: 2 })

    const timer = timers.setTimeout(() => {
      t.ok('pass')
    }, 1001)

    t.strictEqual(timer[timers.kFastTimer], true)
    timers.clearTimeout(timer)
    timer.refresh()
    await new Promise((resolve) => setTimeout(resolve, 2000))
    timers.clearTimeout(timer)
  })

  test('a FastTimer will only increment by the defined TICK_MS value', async (t) => {
    t = tspl(t, { plan: 2 })

    const startInternalClock = timers.now()

    // The long running FastTimer will ensure that the internal clock is
    // incremented by the TICK_MS value in the onTick function
    const longRunningFastTimer = timers.setTimeout(() => {}, 1e10)

    eventLoopBlocker(1000)

    // wait to ensure the timer has fired in the next loop
    await new Promise((resolve) => setTimeout(resolve, 1))

    t.strictEqual(timers.now() - startInternalClock, 499)
    await new Promise((resolve) => setTimeout(resolve, 1000))
    t.strictEqual(timers.now() - startInternalClock, 1497)

    timers.clearTimeout(longRunningFastTimer)
  })

  const getDelta = (start, target) => {
    const end = process.hrtime.bigint()
    const actual = (end - start) / 1_000_000n
    return actual - BigInt(target)
  }

  // timers.setTimeout implements a low resolution timer with a 500 ms granularity
  // It is expected that in the worst case, a timer will fire about 500 ms after the
  // intended amount of time, an extra 200 ms is added to account event loop overhead
  // Timers should never fire excessively early, 1ms early is tolerated
  const ACCEPTABLE_DELTA = 700n

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

  test('refresh correctly with timeout < TICK_MS', async (t) => {
    t = tspl(t, { plan: 3 })

    const start = process.hrtime.bigint()

    const timeout = timers.setTimeout(() => {
      // 400 ms timer was refreshed after 600ms; total target is 1000
      const delta = getDelta(start, 1000)

      t.ok(delta >= -1n, 'refreshed timer fired early')
      t.ok(delta < ACCEPTABLE_DELTA, 'refreshed timer fired late')
    }, 400)

    setTimeout(() => timeout.refresh(), 200)
    setTimeout(() => timeout.refresh(), 400)
    setTimeout(() => timeout.refresh(), 600)

    setTimeout(() => t.ok(true), 1500)
    await t.completed
  })

  test('refresh correctly with timeout > TICK_MS', async (t) => {
    t = tspl(t, { plan: 3 })

    const start = process.hrtime.bigint()

    const timeout = timers.setTimeout(() => {
      // 501ms timer was refreshed after 1250ms; total target is 1751
      const delta = getDelta(start, 1751)

      t.ok(delta >= -1n, 'refreshed timer fired early')
      t.ok(delta < ACCEPTABLE_DELTA, 'refreshed timer fired late')
    }, 501)

    setTimeout(() => timeout.refresh(), 250)
    setTimeout(() => timeout.refresh(), 750)
    setTimeout(() => timeout.refresh(), 1250)

    setTimeout(() => t.ok(true), 3000)
    await t.completed
  })
})
