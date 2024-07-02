import { bench, group, run } from 'mitata'
import { validateCookieMaxAge } from '../../lib/web/cookies/util.js'

const valid = 2000

group('validateCookieMaxAge', () => {
  bench(`valid: ${valid}`, () => {
    return validateCookieMaxAge(valid)
  })
})

await run()
