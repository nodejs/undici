import { bench, group, run } from 'mitata'
import { validateCookieName } from '../../lib/web/cookies/util.js'

const valid = 'Cat'

group('validateCookieName', () => {
  bench(`valid: ${valid}`, () => {
    return validateCookieName(valid)
  })
})

await run()
