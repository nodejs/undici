'use strict'

const { describe, test } = require('node:test')
const { deepStrictEqual } = require('node:assert')
const { parseHttpDate } = require('../../lib/util/date')

describe('parseHttpDate', () => {
  test('IMF-fixdate', () => {
    const values = {
      'Sun, 06 Nov 1994 08:49:37 GMT': new Date(Date.UTC(1994, 10, 6, 8, 49, 37)),
      'Thu, 18 Aug 1950 02:01:18 GMT': new Date(Date.UTC(1950, 7, 18, 2, 1, 18)),
      'Wed, 11 Dec 2024 23:20:57 GMT': new Date(Date.UTC(2024, 11, 11, 23, 20, 57)),
      'Wed, aa Dec 2024 23:20:57 GMT': undefined, // NaN daty
      'aaa, 06 Dec 2024 23:20:57 GMT': undefined, // Invalid day name
      'Wed, 01 aaa 2024 23:20:57 GMT': undefined, // Invalid month
      'Wed, 6 Dec 2024 23:20:07 GMT': undefined, // No leading zero
      'Wed, 06 Dec 2024 3:20:07 GMT': undefined, // No leading zero
      'Wed, 06 Dec 2024 23:1:07 GMT': undefined, // No leading zero
      'Wed, 06 Dec 2024 23:01:7 GMT': undefined, // No leading zero
      'Wed, 06 Dec aaaa 23:01:07 GMT': undefined, // NaN year
      'Wed, 06 Dec 2024 aa:01:07 GMT': undefined, // NaN hour
      'Wed, 06 Dec 2024 23:aa:07 GMT': undefined, // NaN min
      'Wed, 06 Dec 2024 23:01:aa GMT': undefined // NaN sec
    }

    for (const date of Object.keys(values)) {
      deepStrictEqual(parseHttpDate(date), values[date], date)
    }
  })

  test('RFC850', () => {
    const values = {
      'Sunday, 06-Nov-94 08:49:37 GMT': new Date(Date.UTC(1994, 10, 6, 8, 49, 37)),
      'Thursday, 18-Aug-50 02:01:18 GMT': new Date(Date.UTC(2050, 7, 18, 2, 1, 18)),
      'Wednesday, 11-Dec-24 23:20:57 GMT': new Date(Date.UTC(2024, 11, 11, 23, 20, 57)),
      'Wednesday, aa Dec 2024 23:20:57 GMT': undefined, // NaN daty
      'aaa, 06 Dec 2024 23:20:57 GMT': undefined, // Invalid day name
      'Wednesday, 01-aaa-24 23:20:57 GMT': undefined, // Invalid month
      'Wednesday, 6-Dec-24 23:20:07 GMT': undefined, // No leading zero
      'Wednesday, 06-Dec-24 3:20:07 GMT': undefined, // No leading zero
      'Wednesday, 06-Dec-24 23:1:07 GMT': undefined, // No leading zero
      'Wednesday, 06-Dec-24 23:01:7 GMT': undefined, // No leading zero
      'Wednesday, 06 Dec-aa 23:01:07 GMT': undefined, // NaN year
      'Wednesday, 06-Dec-24 aa:01:07 GMT': undefined, // NaN hour
      'Wednesday, 06-Dec-24 23:aa:07 GMT': undefined, // NaN min
      'Wednesday, 06-Dec-24 23:01:aa GMT': undefined // NaN sec
    }

    for (const date of Object.keys(values)) {
      deepStrictEqual(parseHttpDate(date), values[date], date)
    }
  })

  test('asctime()', () => {
    const values = {
      'Sun Nov  6 08:49:37 1994': new Date(Date.UTC(1994, 10, 6, 8, 49, 37)),
      'Thu Aug 18 02:01:18 1950': new Date(Date.UTC(1950, 7, 18, 2, 1, 18)),
      'Wed Dec 11 23:20:57 2024': new Date(Date.UTC(2024, 11, 11, 23, 20, 57)),
      'Wed Dec aa 23:20:57 2024': undefined, // NaN daty
      'aaa Dec 06 23:20:57 2024': undefined, // Invalid day name
      'Wed aaa 01 23:20:57 2024': undefined, // Invalid month
      'Wed Dec 6 23:20:07 2024': undefined, // No leading zero
      'Wed Dec 06 3:20:07 2024': undefined, // No leading zero
      'Wed Dec 06 23:1:07 2024': undefined, // No leading zero
      'Wed Dec 06 23:01:7 2024': undefined, // No leading zero
      'Wed 06 Dec 23:01:07 aaaa': undefined, // NaN year
      'Wed Dec 06 aa:01:07 2024': undefined, // NaN hour
      'Wed Dec 06 23:aa:07 2024': undefined, // NaN min
      'Wed Dec 06 23:01:aa 2024': undefined // NaN sec
    }

    for (const date of Object.keys(values)) {
      deepStrictEqual(parseHttpDate(date), values[date], date)
    }
  })
})
