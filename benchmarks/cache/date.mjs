'use strict'

import { group, bench, run } from 'mitata'
import { parseHttpDate } from '../../lib/util/date.js'

const DATES = [
  // IMF
  'Sun, 06 Nov 1994 08:49:37 GMT',
  'Thu, 18 Aug 1950 02:01:18 GMT',
  'Wed, 11 Dec 2024 23:20:57 GMT',
  'Wed, aa Dec 2024 23:20:57 GMT',
  'aaa, 06 Dec 2024 23:20:57 GMT',
  'Wed, 01 aaa 2024 23:20:57 GMT',
  'Wed, 6 Dec 2024 23:20:07 GMT',
  'Wed, 06 Dec 2024 3:20:07 GMT',
  'Wed, 06 Dec 2024 23:1:07 GMT',
  'Wed, 06 Dec 2024 23:01:7 GMT',
  'Wed, 06 Dec aaaa 23:01:07 GMT',
  'Wed, 06 Dec 2024 aa:01:07 GMT',
  'Wed, 06 Dec 2024 23:aa:07 GMT',
  'Wed, 06 Dec 2024 23:01:aa GMT',

  // RFC850
  'Sunday, 06-Nov-94 08:49:37 GMT',
  'Thursday, 18-Aug-50 02:01:18 GMT',
  'Wednesday, 11-Dec-24 23:20:57 GMT',
  'Wednesday, aa Dec 2024 23:20:57 GMT',
  'aaa, 06 Dec 2024 23:20:57 GMT',
  'Wednesday, 01-aaa-24 23:20:57 GMT',
  'Wednesday, 6-Dec-24 23:20:07 GMT',
  'Wednesday, 06-Dec-24 3:20:07 GMT',
  'Wednesday, 06-Dec-24 23:1:07 GMT',
  'Wednesday, 06-Dec-24 23:01:7 GMT',
  'Wednesday, 06 Dec-aa 23:01:07 GMT',
  'Wednesday, 06-Dec-24 aa:01:07 GMT',
  'Wednesday, 06-Dec-24 23:aa:07 GMT',
  'Wednesday, 06-Dec-24 23:01:aa GMT',

  // asctime()
  'Sun Nov  6 08:49:37 1994',
  'Thu Aug 18 02:01:18 1950',
  'Wed Dec 11 23:20:57 2024',
  'Wed Dec aa 23:20:57 2024',
  'aaa Dec 06 23:20:57 2024',
  'Wed aaa 01 23:20:57 2024',
  'Wed Dec 6 23:20:07 2024',
  'Wed Dec 06 3:20:07 2024',
  'Wed Dec 06 23:1:07 2024',
  'Wed Dec 06 23:01:7 2024',
  'Wed 06 Dec 23:01:07 aaaa',
  'Wed Dec 06 aa:01:07 2024',
  'Wed Dec 06 23:aa:07 2024',
  'Wed Dec 06 23:01:aa 2024'
]

group(() => {
  bench('parseHttpDate', () => {
    for (const date of DATES) {
      parseHttpDate(date)
    }
  })

  bench('new Date()', () => {
    for (const date of DATES) {
      // eslint-disable-next-line no-new
      new Date(date)
    }
  })
})

await run()
