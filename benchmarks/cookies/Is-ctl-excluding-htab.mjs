import { bench, group, run } from 'mitata'
import { isCTLExcludingHtab } from '../../lib/web/cookies/util.js'

const valid = 'Space=Cat; Secure; HttpOnly; Max-Age=2'
const invalid = 'Space=Cat; Secure; HttpOnly; Max-Age=2\x7F'

group('isCTLExcludingHtab', () => {
  bench(`valid: ${valid}`, () => {
    return isCTLExcludingHtab(valid)
  })

  bench(`invalid: ${invalid}`, () => {
    return isCTLExcludingHtab(invalid)
  })
})

await run()
