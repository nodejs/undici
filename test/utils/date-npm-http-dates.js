'use strict'

const { describe, test } = require('node:test')
const { deepStrictEqual } = require('node:assert')
const { parseHttpDate } = require('../../lib/util/date')

// ensure RFC 850 dates are always parsed relativ to march 2022
Date.now = () => new Date(new Date('2022-03-10T15:49:10.000Z').valueOf())

const nov6th94 = new Date('1994-11-06T08:49:37.000Z')
const nov6th1894 = new Date('1894-11-06T08:49:37.000Z')
const nov6th2094 = new Date('2094-11-06T08:49:37.000Z')
const nov6th2194 = new Date('2194-11-06T08:49:37.000Z')
const aug31st22 = new Date('2022-08-31T15:01:59.000Z')

describe('tests from npm http-dates', () => {
  test('parses correct IMF-fixdate', () => {
    deepStrictEqual(parseHttpDate('Sun, 06 Nov 1994 08:49:37 GMT'), nov6th94)
    deepStrictEqual(parseHttpDate('Wed, 31 Aug 2022 15:01:59 GMT'), aug31st22)
  })

  test('parses correct rfc850-date', () => {
    deepStrictEqual(parseHttpDate('Sunday, 06-Nov-94 08:49:37 GMT'), nov6th94)
    deepStrictEqual(parseHttpDate('Wednesday, 31-Aug-22 15:01:59 GMT'), aug31st22)
  })

  test('parses correct asctime-date', () => {
    deepStrictEqual(parseHttpDate('Sun Nov  6 08:49:37 1994'), nov6th94)
    deepStrictEqual(parseHttpDate('Sun Nov 06 08:49:37 1994'), nov6th94)
    deepStrictEqual(parseHttpDate('Wed Aug 31 15:01:59 2022'), aug31st22)
  })

  test('throws TypeError with invalid types', () => {
    deepStrictEqual(parseHttpDate(123), undefined)
    deepStrictEqual(parseHttpDate(true), undefined)
    deepStrictEqual(parseHttpDate({ date: '6th nov 94' }), undefined)
    deepStrictEqual(parseHttpDate(nov6th94), undefined)
  })

  test('throws HTTPdateParseError with incorrect strings', () => {
    [
      // nearly correct IMF-fixdates
      ' Sun, 06 Nov 1994 08:49:37 GMT',
      'Sun, 06 Nov 1994 08:49:37 GMT ',
      'Sun,  06 Nov 1994 08:49:37 GMT',
      'Sun, 06  Nov 1994 08:49:37 GMT',
      'Sun, 06 Nov  1994 08:49:37 GMT',
      'Sun, 06 Nov 1994  08:49:37 GMT',
      'Sun, 06 Nov 1994 08 : 49 : 37 GMT',
      'Sun, 06 Nov 1994 08:49:37  GMT',
      'Sun, 06 Nov 1994 08:49:37.000 GMT',
      'Sun, 06. Nov 1994 08:49:37 GMT',
      'Sun, 06 Nov 94 08:49:37 GMT',
      'Sun, 06 Nov 1994 08:49:37',
      'Sun, 06 Nov 1994 08:49:37 UTC',
      'Mon, 07 Nov 1994 00:00:00 GMT-1',
      // nearly correct rfc850-dates
      ' Sunday, 06-Nov-94 08:49:37 GMT',
      'Sunday, 06-Nov-94 08:49:37 GMT ',
      'Sunday , 06-Nov-94 08:49:37 GMT',
      'Sunday,  06-Nov-94 08:49:37 GMT',
      'Sunday, 06 - Nov - 94 08:49:37 GMT',
      'Sunday, 06-Nov-94  08:49:37 GMT',
      'Sunday, 06-Nov-94 08 : 49 : 37 GMT',
      'Sunday, 06-Nov-94 08:49:37.000 GMT',
      'Sunday, 06-Nov-94 08:49:37',
      'Sunday, 06-Nov-94 08:49:37 UTC',
      'Monday, 07-Nov-94 00:00:00 GMT-2',
      // nearly correct asctime-dates
      ' Sun Nov  6 08:49:37 1994',
      'Sun Nov  6 08:49:37 1994 ',
      'Sun Nov 6 08:49:37 1994',
      'Sun, Nov  6 08:49:37 1994',
      'Sun  Nov  6 08:49:37 1994',
      'Sun Nov   6 08:49:37 1994',
      'Sun Nov  6  08:49:37 1994',
      'Sun Nov  6 08 : 49 : 37 1994',
      'Sun Nov  6 08:49:37  94',
      'Sun Nov  6 08:49:37 1994 GMT',
      'Sun Nov  6 08:49:37 1994 UTC',
      'Mon Nov  7 00:00:00 1994 GMT-2',
      '', // empty string
      'bullshit', // random bullshit
      '1646923144', // unix timestamp
      '2022-03-10T15:39:01.000Z', // ISO 8601 timestamp
      '06/11/2073, 09:49:37' // local string
    ].map((input) => {
      return deepStrictEqual(parseHttpDate(input), undefined, input)
    })
  })

  test('throws HTTPdateParseError with incorrect day of week', () => {
    [
      // wrong day of week IMF-fixdates
      ['Mon, 06 Nov 1994 08:49:37 GMT', 'Mon'],
      ['Tue, 06 Nov 1994 08:49:37 GMT', 'Tue'],
      ['Wed, 06 Nov 1994 08:49:37 GMT', 'Wed'],
      ['Thu, 06 Nov 1994 08:49:37 GMT', 'Thu'],
      ['Fri, 06 Nov 1994 08:49:37 GMT', 'Fri'],
      ['Sat, 06 Nov 1994 08:49:37 GMT', 'Sat'],
      // wrong day of week rfc850-dates
      ['Monday, 06-Nov-94 08:49:37 GMT', 'Mon'],
      ['Tuesday, 06-Nov-94 08:49:37 GMT', 'Tue'],
      ['Wednesday, 06-Nov-94 08:49:37 GMT', 'Wed'],
      ['Thursday, 06-Nov-94 08:49:37 GMT', 'Thu'],
      ['Friday, 06-Nov-94 08:49:37 GMT', 'Fri'],
      ['Saturday, 06-Nov-94 08:49:37 GMT', 'Sat'],
      // wrong day of week asctime-dates
      ['Mon Nov  6 08:49:37 1994', 'Mon'],
      ['Tue Nov  6 08:49:37 1994', 'Tue'],
      ['Wed Nov  6 08:49:37 1994', 'Wed'],
      ['Thu Nov  6 08:49:37 1994', 'Thu'],
      ['Fri Nov  6 08:49:37 1994', 'Fri'],
      ['Sat Nov  6 08:49:37 1994', 'Sat']
    ].map(([input, weekday]) => {
      return deepStrictEqual(parseHttpDate(input), undefined)
    })
  })

  test('parses RFC 850 date differently in every 50 years', () => {
    // @ts-ignore
    Date.now = () => new Date(new Date('1882-01-01T00:00:00.000Z').valueOf())
    deepStrictEqual(parseHttpDate('Tuesday, 06-Nov-94 08:49:37 GMT'), nov6th1894)
    // @ts-ignore
    Date.now = () => new Date(new Date('1932-01-01T00:00:00.000Z').valueOf())
    deepStrictEqual(parseHttpDate('Tuesday, 06-Nov-94 08:49:37 GMT'), nov6th1894)
    // @ts-ignore
    Date.now = () => new Date(new Date('1982-01-01T00:00:00.000Z').valueOf())
    deepStrictEqual(parseHttpDate('Sunday, 06-Nov-94 08:49:37 GMT'), nov6th94)
    // @ts-ignore
    Date.now = () => new Date(new Date('1992-01-01T00:00:00.000Z').valueOf())
    deepStrictEqual(parseHttpDate('Sunday, 06-Nov-94 08:49:37 GMT'), nov6th94)
    // @ts-ignore
    Date.now = () => new Date(new Date('2002-01-01T00:00:00.000Z').valueOf())
    deepStrictEqual(parseHttpDate('Sunday, 06-Nov-94 08:49:37 GMT'), nov6th94)
    // @ts-ignore
    Date.now = () => new Date(new Date('2012-01-01T00:00:00.000Z').valueOf())
    deepStrictEqual(parseHttpDate('Sunday, 06-Nov-94 08:49:37 GMT'), nov6th94)
    // @ts-ignore
    Date.now = () => new Date(new Date('2022-01-01T00:00:00.000Z').valueOf())
    deepStrictEqual(parseHttpDate('Sunday, 06-Nov-94 08:49:37 GMT'), nov6th94)
    // @ts-ignore
    Date.now = () => new Date(new Date('2032-01-01T00:00:00.000Z').valueOf())
    deepStrictEqual(parseHttpDate('Sunday, 06-Nov-94 08:49:37 GMT'), nov6th94)
    // @ts-ignore
    Date.now = () => new Date(new Date('2042-01-01T00:00:00.000Z').valueOf())
    deepStrictEqual(parseHttpDate('Sunday, 06-Nov-94 08:49:37 GMT'), nov6th94)

    // @ts-ignore
    Date.now = () => new Date(new Date('2043-01-01T00:00:00.000Z').valueOf())
    deepStrictEqual(parseHttpDate('Sunday, 06-Nov-94 08:49:37 GMT'), nov6th94)
    // @ts-ignore
    Date.now = () => new Date(new Date('2044-01-01T00:00:00.000Z').valueOf())
    deepStrictEqual(parseHttpDate('Sunday, 06-Nov-94 08:49:37 GMT'), nov6th94)
    // @ts-ignore
    Date.now = () => new Date(new Date('2044-11-06T08:49:36.999Z').valueOf())
    deepStrictEqual(parseHttpDate('Sunday, 06-Nov-94 08:49:37 GMT'), nov6th94)
    // @ts-ignore
    Date.now = () => new Date(new Date('2044-11-06T08:49:37.000Z').valueOf())
    deepStrictEqual(parseHttpDate('Saturday, 06-Nov-94 08:49:37 GMT'), nov6th2094)
    // @ts-ignore
    Date.now = () => new Date(new Date('2045-01-01T00:00:00.000Z').valueOf())
    deepStrictEqual(parseHttpDate('Saturday, 06-Nov-94 08:49:37 GMT'), nov6th2094)

    // @ts-ignore
    Date.now = () => new Date(new Date('2043-01-01T00:00:00.000Z').valueOf())
    deepStrictEqual(parseHttpDate('Sunday, 06-Nov-94 08:49:37 GMT'), nov6th94)
    // @ts-ignore
    Date.now = () => new Date(new Date('2052-01-01T00:00:00.000Z').valueOf())
    deepStrictEqual(parseHttpDate('Saturday, 06-Nov-94 08:49:37 GMT'), nov6th2094)
    // @ts-ignore
    Date.now = () => new Date(new Date('2062-01-01T00:00:00.000Z').valueOf())
    deepStrictEqual(parseHttpDate('Saturday, 06-Nov-94 08:49:37 GMT'), nov6th2094)
    // @ts-ignore
    Date.now = () => new Date(new Date('2072-01-01T00:00:00.000Z').valueOf())
    deepStrictEqual(parseHttpDate('Saturday, 06-Nov-94 08:49:37 GMT'), nov6th2094)
    // @ts-ignore
    Date.now = () => new Date(new Date('2082-01-01T00:00:00.000Z').valueOf())
    deepStrictEqual(parseHttpDate('Saturday, 06-Nov-94 08:49:37 GMT'), nov6th2094)
    // @ts-ignore
    Date.now = () => new Date(new Date('2092-01-01T00:00:00.000Z').valueOf())
    deepStrictEqual(parseHttpDate('Saturday, 06-Nov-94 08:49:37 GMT'), nov6th2094)
    // @ts-ignore
    Date.now = () => new Date(new Date('2132-01-01T00:00:00.000Z').valueOf())
    deepStrictEqual(parseHttpDate('Saturday, 06-Nov-94 08:49:37 GMT'), nov6th2094)
    // @ts-ignore
    Date.now = () => new Date(new Date('2182-01-01T00:00:00.000Z').valueOf())
    deepStrictEqual(parseHttpDate('Thursday, 06-Nov-94 08:49:37 GMT'), nov6th2194)

    // @ts-ignore
    Date.now = () => new Date(new Date('2022-03-10T15:49:10.000Z').valueOf())
  })
})
