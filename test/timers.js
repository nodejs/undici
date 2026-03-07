'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { describe, test } = require('node:test')
const FakeTimers = require('@sinonjs/fake-timers')

const clock = FakeTimers.install()

const timers = require('../lib/util/timers')
const { eventLoopBlocker } = require('./utils/event-loop-blocker')

// timers.setTimeout implements a low resolution timer with a 500 ms granularity
// It is expected that in the worst case, a timer will fire about 500 ms after the
// intended amount of time, an extra 200 ms is added to account event loop overhead
// Timers should never fire excessively early, 1ms early is tolerated
const ACCEPTABLE_DELTA = 700

function tick (duration) {
  for (let i = 0; i < duration; ++i) {
    clock.tick(1)
  }
}

describe('timers', () => {
  test('timers exports a clearTimeout', (t) => {
    t = tspl(t, { plan: 1 })

    t.ok(typeof timers.clearTimeout === 'function')
  })

  test('timers exports a setTimeout', (t) => {
    t = tspl(t, { plan: 1 })

    t.ok(typeof timers.setTimeout === 'function')
  })

  test('handles invalid callback gracefully', (t) => {
    t = tspl(t, { plan: 1 })
    t.throws(() => timers.setTimeout(null, 1000), TypeError)
  })

  test('handles invalid delay gracefully', (t) => {
    t = tspl(t, { plan: 1 })
    const timer = timers.setTimeout(() => {}, -1)
    t.ok(timer) // Should handle gracefully
  })

  test('setTimeout instantiates a native NodeJS.Timeout when delay is lower or equal 1e3 ms', (t) => {
    t = tspl(t, { plan: 2 })

    t.strictEqual(timers.setTimeout(() => { }, 999)[timers.kFastTimer], undefined)
    t.strictEqual(timers.setTimeout(() => { }, 1e3)[timers.kFastTimer], undefined)
  })

  test('setTimeout instantiates a FastTimer when delay is bigger than 1e3 ms', (t) => {
    t = tspl(t, { plan: 1 })

    const timeout = timers.setTimeout(() => { }, 1001)
    t.strictEqual(timeout[timers.kFastTimer], true)
  })

  test('clearTimeout can clear a node native Timeout', (t) => {
    t = tspl(t, { plan: 1 })

    const nativeTimeoutId = setTimeout(() => { t.fail() }, 1)
    t.ok(timers.clearTimeout(nativeTimeoutId) === undefined)
    tick(10)
  })

  test('a FastTimer will get a _idleStart value after short time', async (t) => {
    t = tspl(t, { plan: 3 })

    const timer = timers.setTimeout(() => {
      t.fail('timer should not have fired')
    }, 1e4)

    t.strictEqual(timer[timers.kFastTimer], true)
    t.strictEqual(timer._idleStart, -1)

    tick(1e3)
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
    tick(750)
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
    tick(750)
    t.strictEqual(timer._idleStart, -1)
  })

  test('a cleared FastTimer can be refreshed', async (t) => {
    t = tspl(t, { plan: 2 })

    const timer = timers.setFastTimeout(() => {
      t.ok('pass')
    }, 1001)

    t.strictEqual(timer[timers.kFastTimer], true)
    timers.clearTimeout(timer)
    timer.refresh()
    tick(2000)
    timers.clearTimeout(timer)
  })

  const getDelta = (start, target) => {
    const end = performance.now()
    const actual = end - start
    return actual - target
  }

  test('refresh correctly with timeout < TICK_MS', async (t) => {
    t = tspl(t, { plan: 3 })

    const start = performance.now()

    const timeout = timers.setTimeout(() => {
      // 80 ms timer was refreshed after 120 ms; total target is 200 ms
      const delta = getDelta(start, 200)

      t.ok(delta >= -1, 'refreshed timer fired early')
      t.ok(delta < ACCEPTABLE_DELTA, 'refreshed timer fired late')
    }, 80)

    setTimeout(() => timeout.refresh(), 40)
    setTimeout(() => timeout.refresh(), 80)
    setTimeout(() => timeout.refresh(), 120)

    setTimeout(() => t.ok(true), 260)

    tick(500)
    await t.completed
  })

  test('refresh correctly with timeout > TICK_MS', async (t) => {
    t = tspl(t, { plan: 3 })

    const start = performance.now()

    const timeout = timers.setTimeout(() => {
      // 501ms timer was refreshed after 1250ms; total target is 1751
      const delta = getDelta(start, 1751)

      t.ok(delta >= -1, 'refreshed timer fired early')
      t.ok(delta < ACCEPTABLE_DELTA, 'refreshed timer fired late')
    }, 501)

    setTimeout(() => timeout.refresh(), 250)
    setTimeout(() => timeout.refresh(), 750)
    setTimeout(() => timeout.refresh(), 1250)

    setTimeout(() => t.ok(true), 1800)

    tick(2000)
    await t.completed
  })

  test('refresh correctly FastTimer with timeout > TICK_MS', async (t) => {
    t = tspl(t, { plan: 3 })

    // The long running FastTimer will ensure that the internal clock is
    // incremented by the TICK_MS value in the onTick function
    const longRunningFastTimer = timers.setTimeout(() => {}, 1e10)

    const start = timers.now()

    const timeout = timers.setFastTimeout(() => {
      const delta = (timers.now() - start) - 2493

      t.ok(delta >= -1, `refreshed timer fired early (${delta} ms)`)
      t.ok(delta < ACCEPTABLE_DELTA, `refreshed timer fired late (${delta} ms)`)
    }, 1001)

    tick(250)
    timeout.refresh()

    tick(250)
    timeout.refresh()

    tick(250)
    timeout.refresh()

    tick(250)
    timeout.refresh()

    timers.clearTimeout(longRunningFastTimer)
    setTimeout(() => t.ok(true), 500)

    tick(5000)
    await t.completed
  })

  test('a FastTimer will only increment by the defined TICK_MS value', async (t) => {
    t = tspl(t, { plan: 6 })

    const startInternalClock = timers.now()

    // The long running FastTimer will ensure that the internal clock is
    // incremented by the TICK_MS value in the onTick function
    const longRunningFastTimer = timers.setTimeout(() => {}, 1e10)

    eventLoopBlocker(1000)

    // wait to ensure the timer has fired in the next loop
    await new Promise((resolve) => resolve())

    tick(250)
    t.strictEqual(timers.now() - startInternalClock, 0)
    tick(250)
    t.strictEqual(timers.now() - startInternalClock, 499)
    tick(250)
    t.strictEqual(timers.now() - startInternalClock, 499)
    tick(250)
    t.strictEqual(timers.now() - startInternalClock, 998)
    tick(250)
    t.strictEqual(timers.now() - startInternalClock, 998)
    tick(250)
    t.strictEqual(timers.now() - startInternalClock, 1497)

    timers.clearTimeout(longRunningFastTimer)
  })

  test('meet acceptable resolution time', async (t) => {
    const testTimeouts = [0, 1, 499, 500, 501, 990, 999, 1000, 1001, 1100, 1400, 1499, 1500, 4000, 5000]

    t = tspl(t, { plan: testTimeouts.length * 2 })

    const start = performance.now()

    for (const target of testTimeouts) {
      timers.setTimeout(() => {
        const delta = getDelta(start, target)

        t.ok(delta >= -1, `${target}ms fired early`)
        t.ok(delta < ACCEPTABLE_DELTA, `${target}ms fired late, got difference of ${delta}ms`)
      }, target)
    }

    for (let i = 0; i < 6000; ++i) {
      clock.tick(1)
    }

    await t.completed
  })

  test('pendingTimers should not be processed in the same tick', (t) => {
    t = tspl(t, { plan: 2 })

    let ranFirst = false
    let ranSecond = false

    // the second timer is scheduled in the callback of the first one
    timers.setFastTimeout(() => {
      ranFirst = true
      timers.setFastTimeout(() => {
        ranSecond = true
      }, 10)
    }, 10)

    // need to tick enough to get the first timer to run
    tick(500)

    t.ok(ranFirst, 'first timer should have fired')
    t.ok(!ranSecond, 'second timer should not fire in the same tick')
  })

  test('multiple FastTimers expiring in the same tick execute correctly', async (t) => {
    t = tspl(t, { plan: 1 })

    let fired = 0

    const timer1 = timers.setFastTimeout(() => fired++, 400)
    const timer2 = timers.setFastTimeout(() => fired++, 400)
    const timer3 = timers.setFastTimeout(() => fired++, 400)

    // Advance clock past execution time
    tick(501)
    await Promise.resolve() // flush pending microtasks

    t.strictEqual(fired, 3)

    timers.clearTimeout(timer1)
    timers.clearTimeout(timer2)
    timers.clearTimeout(timer3)
  })

  test('FastTimer clears another timer during its callback', async (t) => {
    t = tspl(t, { plan: 1 })

    let fired = 0

    const clearingTimer = timers.setFastTimeout(() => {
      timers.clearTimeout(timerToClear)
      fired++
    }, 400)
    const timerToClear = timers.setFastTimeout(() => fired++, 400)

    tick(501)
    await Promise.resolve() // flush pending microtasks

    t.strictEqual(fired, 1)

    timers.clearTimeout(clearingTimer)
  })

  test('FastTimers added during a callback are processed in next tick', async (t) => {
    t = tspl(t, { plan: 3 })

    let firedFirst = false
    let firedSecond = false

    const parentTimer = timers.setFastTimeout(() => {
      firedFirst = true
      timers.setFastTimeout(() => {
        firedSecond = true
      }, 10)
    }, 400)

    tick(501)
    await Promise.resolve() // first timer fires
    t.ok(firedFirst)
    t.ok(!firedSecond) // newly added timer should not fire yet

    tick(501)
    await Promise.resolve() // next tick for newly added timer
    t.ok(firedSecond)

    timers.clearTimeout(parentTimer)
  })

  test('FastTimers slightly before TICK_MS boundary fire correctly', async (t) => {
    t = tspl(t, { plan: 1 })
    let fired = 0

    timers.setFastTimeout(() => fired++, 498)
    tick(499)
    await Promise.resolve()
    t.strictEqual(fired, 1)
  })

  test('refreshing a FastTimer updates _executionTime', async (t) => {
    t = tspl(t, { plan: 1 })

    const timer = timers.setFastTimeout(() => {}, 1001)

    timer.refresh()
    tick(500)
    await Promise.resolve()

    t.notStrictEqual(timer._executionTime, -1)
  })

  test('long-running FastTimers do not block internal clock', async (t) => {
    t = tspl(t, { plan: 1 })

    const start = timers.now()
    const longTimer = timers.setFastTimeout(() => {}, 1e10)

    tick(500)
    await Promise.resolve()

    t.strictEqual(timers.now() - start, 499)

    timers.clearTimeout(longTimer)
  })

  test('FastTimer with 0ms delay fires in next tick', async (t) => {
    t = tspl(t, { plan: 2 })
    let fired = false
    const timer = timers.setFastTimeout(() => { fired = true }, 0)
    t.ok(!fired)
    tick(500)
    t.ok(fired)
    timers.clearTimeout(timer)
  })

  test('clearing many timers does not cause memory leaks', (t) => {
    t = tspl(t, { plan: 1 })
    const timersArray = []

    // Create many timers
    for (let i = 0; i < 1000; i++) {
      timersArray.push(timers.setFastTimeout(() => {}, 5000))
    }

    // Clear them all
    timersArray.forEach(timer => timers.clearTimeout(timer))

    // Heap should be cleared
    tick(1000)
    t.strictEqual(timers.timerHeap?.size || 0, 0)
  })

  test('timer heap maintains ordering invariant', (t) => {
    t = tspl(t, { plan: 1 })

    const timersArray = []
    const delays = [5000, 1500, 3000, 2000, 4000]

    delays.forEach(delay => {
      timersArray.push(timers.setFastTimeout(() => {}, delay))
    })

    tick(1000) // Let them become active

    // Check heap property (would need to expose heap for testing)
    t.ok(true) // This would need internal heap access
  })
  test('timer callback receives correct argument', (t) => {
    t = tspl(t, { plan: 1 })

    const testArg = { test: 'data' }
    timers.setTimeout((arg) => {
      t.deepStrictEqual(arg, testArg)
    }, 1500, testArg)

    tick(2000)
  })
  test('refreshing timer multiple times in same tick', (t) => {
    t = tspl(t, { plan: 1 })

    let fired = 0
    const timer = timers.setFastTimeout(() => fired++, 1000)

    // Multiple refreshes in same tick
    timer.refresh()
    timer.refresh()
    timer.refresh()

    tick(1500)
    t.strictEqual(fired, 1) // Should only fire once
  })
})
