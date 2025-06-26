'use strict'
/* global jest, describe, it, beforeEach, afterEach, expect */

// test/jest/util-timers.test.js
const timers = require('../../lib/util/timers')

describe('util/timers under fake timers', () => {
  beforeEach(() => jest.useFakeTimers('modern'))
  afterEach(() => {
    jest.useRealTimers()
    try {
      timers.reset()
    } catch {}
  })

  it('setFastTimeout + clearFastTimeout does not throw', () => {
    const fast = timers.setFastTimeout(() => {}, 2000)
    expect(typeof fast.refresh).toBe('function')
    expect(() => timers.clearFastTimeout(fast)).not.toThrow()
  })

  it('short setTimeout + clearTimeout does not throw', () => {
    const t = timers.setTimeout(() => {}, 10)
    expect(() => timers.clearTimeout(t)).not.toThrow()
  })
})
