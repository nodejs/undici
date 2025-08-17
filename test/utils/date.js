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
      'Wed,\t11 Dec 2024 23:20:57 GMT': undefined, // Invalid whitespace
      'Wed, 11\tDec 2024 23:20:57 GMT': undefined, // Invalid whitespace
      'Wed, 11 Dec\t2024 23:20:57 GMT': undefined, // Invalid whitespace
      'Wed, 11 Dec 2024\t23:20:57 GMT': undefined, // Invalid whitespace
      'Wed, 11 Dec 2024 23:20:57\tGMT': undefined, // Invalid whitespace
      'Wed, 11 Dec 2024 23.20:57 GMT': undefined, // Invalid separator
      'Wed, 11 Dec 2024 23:20.57 GMT': undefined, // Invalid separator
      'Wed, 11 Dec 2024 23:20:57 UTC': undefined, // UTC is not a valid timezone
      'Wed, aa Dec 2024 23:20:57 GMT': undefined, // NaN day
      'aaa, 06 Dec 2024 23:20:57 GMT': undefined, // Invalid day name
      'Wed, 01 aaa 2024 23:20:57 GMT': undefined, // Invalid month
      'Wed, 6 Dec 2024 23:20:07 GMT': undefined, // No leading zero
      'Wed, 06 Dec 2024 3:20:07 GMT': undefined, // No leading zero
      'Wed, 06 Dec 2024 23:1:07 GMT': undefined, // No leading zero
      'Wed, 06 Dec 2024 23:01:7 GMT': undefined, // No leading zero
      'Wed, a6 Dec 2024 23:01:07 GMT': undefined, // No leading zero
      'Wed, 06 Dec aaaa 23:01:07 GMT': undefined, // NaN year
      'Wed, 06 Dec 2024 aa:01:07 GMT': undefined, // NaN hour
      'Wed, 06 Dec 2024 23:aa:07 GMT': undefined, // NaN min
      'Wed, 06 Dec 2024 23:01:a7 GMT': undefined, // NaN sec
      'Wed, 06 Dec 2024 23:01:+7 GMT': undefined, // NaN sec
      'Wed, 06 Dec 2024 23:01:aa GMT': undefined // NaN sec
    }

    for (const date of Object.keys(values)) {
      deepStrictEqual(parseHttpDate(date), values[date], date)
    }
  })

  test('RFC850', () => {
    const values = {
      'Sunday, 06-Nov-94 08:49:37 GMT': new Date(Date.UTC(1994, 10, 6, 8, 49, 37)),
      'Monday, 06-Nov-94 08:49:37 GMT': new Date(Date.UTC(1994, 10, 6, 8, 49, 37)),
      'Tuesday, 06-Nov-94 08:49:37 GMT': new Date(Date.UTC(1994, 10, 6, 8, 49, 37)),
      'Wednesday, 06-Nov-94 08:49:37 GMT': new Date(Date.UTC(1994, 10, 6, 8, 49, 37)),
      'Thursday, 06-Nov-94 08:49:37 GMT': new Date(Date.UTC(1994, 10, 6, 8, 49, 37)),
      'Friday, 06-Nov-94 08:49:37 GMT': new Date(Date.UTC(1994, 10, 6, 8, 49, 37)),
      'Saturday, 06-Nov-94 08:49:37 GMT': new Date(Date.UTC(1994, 10, 6, 8, 49, 37)),

      'Thursday, 18-Aug-50 02:01:18 GMT': new Date(Date.UTC(2050, 7, 18, 2, 1, 18)),
      'Wednesday, 11-Dec-24 23:20:57 GMT': new Date(Date.UTC(2024, 11, 11, 23, 20, 57)),
      'Wednesday, 11-Dec-24 23:20:57 UTC': undefined, // UTC is not a valid timezone
      'Wednesday  11-Dec-24 23:20:57 GMT': undefined, // no comma
      'Wednesday, 11-Dec-bc 23:20:57 GMT': undefined, // NaN year
      'Wednesday, aa Dec 2024 23:20:57 GMT': undefined, // NaN day
      'Thursday, +7-Aug-50 02:01:18 GMT': undefined, // NaN day
      'Funday, 06-Nov-94 08:49:37 GMT': undefined, // invalid day name
      'aaa, 06 Dec 2024 23:20:57 GMT': undefined, // Invalid day name
      'Wednesday, 01-aaa-24 23:20:57 GMT': undefined, // Invalid month
      'Wednesday, 6-Dec-24 23:20:07 GMT': undefined, // No leading zero
      'Wednesday, 06-Dec-24 3:20:07 GMT': undefined, // No leading zero
      'Wednesday, 06-Dec-24 23:1:07 GMT': undefined, // No leading zero
      'Wednesday, 06-Dec-24 23:01:7 GMT': undefined, // No leading zero
      'Wednesday, 06 Dec-aa 23:01:07 GMT': undefined, // NaN year
      'Wednesday, 06-Dec-24 aa:01:07 GMT': undefined, // NaN hour
      'Wednesday, 06-Dec-24 23:aa:07 GMT': undefined, // NaN min
      'Wednesday, 06-Dec-24 23:01:+7 GMT': undefined, // NaN min
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

      'Tue Jan  1 23:20:57 2024': new Date(Date.UTC(2024, 0, 1, 23, 20, 57)),
      'Thu Feb  1 23:20:57 2024': new Date(Date.UTC(2024, 1, 1, 23, 20, 57)),
      'Fri Mar  1 23:20:57 2024': new Date(Date.UTC(2024, 2, 1, 23, 20, 57)),
      'Sat Apr  1 23:20:57 2024': new Date(Date.UTC(2024, 3, 1, 23, 20, 57)),
      'Sun May  1 23:20:57 2024': new Date(Date.UTC(2024, 4, 1, 23, 20, 57)),
      'Mon Jun  1 23:20:57 2024': new Date(Date.UTC(2024, 5, 1, 23, 20, 57)),
      'Tue Jul  1 23:20:57 2024': new Date(Date.UTC(2024, 6, 1, 23, 20, 57)),
      'Wed Aug  1 23:20:57 2024': new Date(Date.UTC(2024, 7, 1, 23, 20, 57)),
      'Thu Sep  1 23:20:57 2024': new Date(Date.UTC(2024, 8, 1, 23, 20, 57)),
      'Fri Oct  1 23:20:57 2024': new Date(Date.UTC(2024, 9, 1, 23, 20, 57)),
      'Sat Nov  1 23:20:57 2024': new Date(Date.UTC(2024, 10, 1, 23, 20, 57)),
      'Sun Dec  1 23:20:57 2024': new Date(Date.UTC(2024, 11, 1, 23, 20, 57)),

      'Tue Jan  1 00:20:57 2024': new Date(Date.UTC(2024, 0, 1, 0, 20, 57)),
      'Tue Jan  1 01:20:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 20, 57)),
      'Tue Jan  1 02:20:57 2024': new Date(Date.UTC(2024, 0, 1, 2, 20, 57)),
      'Tue Jan  1 03:20:57 2024': new Date(Date.UTC(2024, 0, 1, 3, 20, 57)),
      'Tue Jan  1 04:20:57 2024': new Date(Date.UTC(2024, 0, 1, 4, 20, 57)),
      'Tue Jan  1 05:20:57 2024': new Date(Date.UTC(2024, 0, 1, 5, 20, 57)),
      'Tue Jan  1 06:20:57 2024': new Date(Date.UTC(2024, 0, 1, 6, 20, 57)),
      'Tue Jan  1 07:20:57 2024': new Date(Date.UTC(2024, 0, 1, 7, 20, 57)),
      'Tue Jan  1 08:20:57 2024': new Date(Date.UTC(2024, 0, 1, 8, 20, 57)),
      'Tue Jan  1 09:20:57 2024': new Date(Date.UTC(2024, 0, 1, 9, 20, 57)),
      'Tue Jan  1 10:20:57 2024': new Date(Date.UTC(2024, 0, 1, 10, 20, 57)),
      'Tue Jan  1 11:20:57 2024': new Date(Date.UTC(2024, 0, 1, 11, 20, 57)),
      'Tue Jan  1 12:20:57 2024': new Date(Date.UTC(2024, 0, 1, 12, 20, 57)),
      'Tue Jan  1 13:20:57 2024': new Date(Date.UTC(2024, 0, 1, 13, 20, 57)),
      'Tue Jan  1 14:20:57 2024': new Date(Date.UTC(2024, 0, 1, 14, 20, 57)),
      'Tue Jan  1 15:20:57 2024': new Date(Date.UTC(2024, 0, 1, 15, 20, 57)),
      'Tue Jan  1 16:20:57 2024': new Date(Date.UTC(2024, 0, 1, 16, 20, 57)),
      'Tue Jan  1 17:20:57 2024': new Date(Date.UTC(2024, 0, 1, 17, 20, 57)),
      'Tue Jan  1 18:20:57 2024': new Date(Date.UTC(2024, 0, 1, 18, 20, 57)),
      'Tue Jan  1 19:20:57 2024': new Date(Date.UTC(2024, 0, 1, 19, 20, 57)),
      'Tue Jan  1 20:20:57 2024': new Date(Date.UTC(2024, 0, 1, 20, 20, 57)),
      'Tue Jan  1 21:20:57 2024': new Date(Date.UTC(2024, 0, 1, 21, 20, 57)),
      'Tue Jan  1 22:20:57 2024': new Date(Date.UTC(2024, 0, 1, 22, 20, 57)),
      // 'Tue Jan  1 23:20:57 2024': new Date(Date.UTC(2024, 0, 1, 23, 20, 57)),
      'Tue Jan  1 24:20:57 2024': undefined, // Invalid hour

      'Tue Jan  1 01:00:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 0, 57)),
      'Tue Jan  1 01:01:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 1, 57)),
      'Tue Jan  1 01:02:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 2, 57)),
      'Tue Jan  1 01:03:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 3, 57)),
      'Tue Jan  1 01:04:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 4, 57)),
      'Tue Jan  1 01:05:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 5, 57)),
      'Tue Jan  1 01:06:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 6, 57)),
      'Tue Jan  1 01:07:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 7, 57)),
      'Tue Jan  1 01:08:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 8, 57)),
      'Tue Jan  1 01:09:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 9, 57)),
      'Tue Jan  1 01:10:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 10, 57)),
      'Tue Jan  1 01:11:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 11, 57)),
      'Tue Jan  1 01:12:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 12, 57)),
      'Tue Jan  1 01:13:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 13, 57)),
      'Tue Jan  1 01:14:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 14, 57)),
      'Tue Jan  1 01:15:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 15, 57)),
      'Tue Jan  1 01:16:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 16, 57)),
      'Tue Jan  1 01:17:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 17, 57)),
      'Tue Jan  1 01:18:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 18, 57)),
      'Tue Jan  1 01:19:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 19, 57)),
      // 'Tue Jan  1 01:20:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 20, 57)),
      'Tue Jan  1 01:21:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 21, 57)),
      'Tue Jan  1 01:22:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 22, 57)),
      'Tue Jan  1 01:23:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 23, 57)),
      'Tue Jan  1 01:24:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 24, 57)),
      'Tue Jan  1 01:25:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 25, 57)),
      'Tue Jan  1 01:26:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 26, 57)),
      'Tue Jan  1 01:27:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 27, 57)),
      'Tue Jan  1 01:28:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 28, 57)),
      'Tue Jan  1 01:29:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 29, 57)),
      'Tue Jan  1 01:30:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 30, 57)),
      'Tue Jan  1 01:31:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 31, 57)),
      'Tue Jan  1 01:32:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 32, 57)),
      'Tue Jan  1 01:33:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 33, 57)),
      'Tue Jan  1 01:34:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 34, 57)),
      'Tue Jan  1 01:35:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 35, 57)),
      'Tue Jan  1 01:36:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 36, 57)),
      'Tue Jan  1 01:37:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 37, 57)),
      'Tue Jan  1 01:38:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 38, 57)),
      'Tue Jan  1 01:39:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 39, 57)),
      'Tue Jan  1 01:40:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 40, 57)),
      'Tue Jan  1 01:41:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 41, 57)),
      'Tue Jan  1 01:42:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 42, 57)),
      'Tue Jan  1 01:43:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 43, 57)),
      'Tue Jan  1 01:44:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 44, 57)),
      'Tue Jan  1 01:45:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 45, 57)),
      'Tue Jan  1 01:46:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 46, 57)),
      'Tue Jan  1 01:47:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 47, 57)),
      'Tue Jan  1 01:48:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 48, 57)),
      'Tue Jan  1 01:49:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 49, 57)),
      'Tue Jan  1 01:50:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 50, 57)),
      'Tue Jan  1 01:51:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 51, 57)),
      'Tue Jan  1 01:52:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 52, 57)),
      'Tue Jan  1 01:53:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 53, 57)),
      'Tue Jan  1 01:54:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 54, 57)),
      'Tue Jan  1 01:55:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 55, 57)),
      'Tue Jan  1 01:56:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 56, 57)),
      'Tue Jan  1 01:57:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 57, 57)),
      'Tue Jan  1 01:58:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 58, 57)),
      'Tue Jan  1 01:59:57 2024': new Date(Date.UTC(2024, 0, 1, 1, 59, 57)),
      'Tue Jan  1 01:60:57 2024': undefined, // Invalid minute

      'Tue Jan  1 02:00:00 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 0)),
      'Tue Jan  1 02:00:01 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 1)),
      'Tue Jan  1 02:00:02 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 2)),
      'Tue Jan  1 02:00:03 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 3)),
      'Tue Jan  1 02:00:04 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 4)),
      'Tue Jan  1 02:00:05 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 5)),
      'Tue Jan  1 02:00:06 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 6)),
      'Tue Jan  1 02:00:07 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 7)),
      'Tue Jan  1 02:00:08 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 8)),
      'Tue Jan  1 02:00:09 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 9)),
      'Tue Jan  1 02:00:10 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 10)),
      'Tue Jan  1 02:00:11 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 11)),
      'Tue Jan  1 02:00:12 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 12)),
      'Tue Jan  1 02:00:13 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 13)),
      'Tue Jan  1 02:00:14 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 14)),
      'Tue Jan  1 02:00:15 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 15)),
      'Tue Jan  1 02:00:16 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 16)),
      'Tue Jan  1 02:00:17 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 17)),
      'Tue Jan  1 02:00:18 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 18)),
      'Tue Jan  1 02:00:19 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 19)),
      'Tue Jan  1 02:00:20 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 20)),
      'Tue Jan  1 02:00:21 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 21)),
      'Tue Jan  1 02:00:22 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 22)),
      'Tue Jan  1 02:00:23 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 23)),
      'Tue Jan  1 02:00:24 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 24)),
      'Tue Jan  1 02:00:25 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 25)),
      'Tue Jan  1 02:00:26 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 26)),
      'Tue Jan  1 02:00:27 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 27)),
      'Tue Jan  1 02:00:28 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 28)),
      'Tue Jan  1 02:00:29 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 29)),
      'Tue Jan  1 02:00:30 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 30)),
      'Tue Jan  1 02:00:31 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 31)),
      'Tue Jan  1 02:00:32 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 32)),
      'Tue Jan  1 02:00:33 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 33)),
      'Tue Jan  1 02:00:34 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 34)),
      'Tue Jan  1 02:00:35 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 35)),
      'Tue Jan  1 02:00:36 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 36)),
      'Tue Jan  1 02:00:37 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 37)),
      'Tue Jan  1 02:00:38 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 38)),
      'Tue Jan  1 02:00:39 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 39)),
      'Tue Jan  1 02:00:40 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 40)),
      'Tue Jan  1 02:00:41 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 41)),
      'Tue Jan  1 02:00:42 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 42)),
      'Tue Jan  1 02:00:43 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 43)),
      'Tue Jan  1 02:00:44 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 44)),
      'Tue Jan  1 02:00:45 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 45)),
      'Tue Jan  1 02:00:46 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 46)),
      'Tue Jan  1 02:00:47 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 47)),
      'Tue Jan  1 02:00:48 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 48)),
      'Tue Jan  1 02:00:49 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 49)),
      'Tue Jan  1 02:00:50 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 50)),
      'Tue Jan  1 02:00:51 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 51)),
      'Tue Jan  1 02:00:52 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 52)),
      'Tue Jan  1 02:00:53 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 53)),
      'Tue Jan  1 02:00:54 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 54)),
      'Tue Jan  1 02:00:55 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 55)),
      'Tue Jan  1 02:00:56 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 56)),
      'Tue Jan  1 02:00:57 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 57)),
      'Tue Jan  1 02:00:58 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 58)),
      'Tue Jan  1 02:00:59 2024': new Date(Date.UTC(2024, 0, 1, 2, 0, 59)),
      'Tue Jan  1 02:00:60 2024': undefined, // Invalid second

      'Wed Dec aa 23:20:57 2024': undefined, // NaN day
      'aaa Dec 06 23:20:57 2024': undefined, // Invalid day name
      'Wed aaa 01 23:20:57 2024': undefined, // Invalid month
      'Wed Dec 11 +3:20:57 2024': undefined, // No leading zero
      'Wed Dec 11 23:+0:57 2024': undefined, // No leading zero
      'Wed Dec 11 23:20:+7 2024': undefined, // No leading zero
      'Wed Dec 11 23:20:07 t024': undefined, // No leading zero
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
