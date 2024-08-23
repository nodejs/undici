import { bench, group, run } from 'mitata'

group('timers', () => {
  bench('Date.now()', () => {
    Date.now()
  })
  bench('performance.now()', () => {
    performance.now()
  })
  bench('Math.trunc(performance.now())', () => {
    Math.trunc(performance.now())
  })
  bench('process.uptime()', () => {
    process.uptime()
  })
})

await run()
