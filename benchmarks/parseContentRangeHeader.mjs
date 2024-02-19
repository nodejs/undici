import { bench, group, run } from 'mitata'
import { parseContentRangeHeader } from '../lib/core/util.js'

group('parseContentRangeHeader', () => {
  bench('parseContentRangeHeader undefined', () => {
    parseContentRangeHeader()
  })
  bench('parseContentRangeHeader empty', () => {
    parseContentRangeHeader('')
  })
  bench('parseContentRangeHeader bytes 0-400/400', () => {
    parseContentRangeHeader('bytes 0-400/400')
  })
  bench('parseContentRangeHeader bytes 0-400/*', () => {
    parseContentRangeHeader('bytes 0-400/*')
  })
})

await run()
