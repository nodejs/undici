import { bench, group, run } from 'mitata'
import { validateCookieValue } from '../../lib/web/cookies/util.js'

const valid = 'Cat'
const wrappedValid = `"${valid}"`

group('validateCookieValue', () => {
  bench(`valid: ${valid}`, () => {
    return validateCookieValue(valid)
  })
  bench(`valid: ${wrappedValid}`, () => {
    return validateCookieValue(wrappedValid)
  })
})

await run()
