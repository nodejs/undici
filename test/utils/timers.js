const { test, describe } = require('node:test')
const { nowAbsolute } = require('../../lib/util/timers')
const { equal } = require('assert')

describe('Fast Timers', () => {
  test('nowAbsolute', () => {
    equal(Date.now(), nowAbsolute())
  })
})
