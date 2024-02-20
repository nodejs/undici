import { bench, group, run } from 'mitata'
import { getFieldValues } from '../lib/cache/util.js'

const values = [
  'foo',
  'invälid',
  'foo, '
]

group('getFieldValues', () => {
  bench('getFieldValues', () => {
    for (let i = 0; i < values.length; ++i) {
      getFieldValues(values[i])
    }
  })
})

await run()
