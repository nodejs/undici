import { bench, group, run } from 'mitata'
import timers from '../../lib/util/timers.js'

group(() => {
  bench('Date.now()', () => {
    Date.now()
  })
  bench('nowAbsolute()', () => {
    timers.nowAbsolute()
  })
})

await run()
