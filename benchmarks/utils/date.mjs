import { Bench } from 'tinybench'

import { parseHttpDate } from '../../lib/util/date.js'

const asctime = 'Sun Nov  6 08:49:37 1994'
const rfc850 = 'Sunday, 06-Nov-94 08:49:37 GMT'
const imf = 'Sun, 06 Nov 1994 08:49:37 GMT'

const bench = new Bench({ name: 'simple benchmark', time: 100 })

bench
  .add('asctime', () => {
    parseHttpDate(asctime)
  })
  .add('rfc850', () => {
    parseHttpDate(rfc850)
  })
  .add('imf', () => {
    parseHttpDate(imf)
  })

await bench.run()

console.log(bench.name)
console.table(bench.table())
