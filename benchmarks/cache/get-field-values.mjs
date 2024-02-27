import { bench, group, run } from 'mitata'
import { getFieldValues } from '../../lib/web/cache/util.js'

const values = [
  '',
  'foo',
  'invälid',
  'foo, ',
  'foo, bar',
  'foo, bar, baz',
  'foo, bar, baz, ',
  'foo, bar, baz, , '
]

group('getFieldValues', () => {
  bench('getFieldValues', () => {
    for (let i = 0; i < values.length; ++i) {
      getFieldValues(values[i])
    }
  })
})

await run()
