import { bench, group, run } from 'mitata'
import { isCTLExcludingHtab } from '../lib/cookies/util.js'

const valid = 'Space=Cat; Secure; HttpOnly; Max-Age=2'
const invalid = 'Space=Cat; Secure; HttpOnly; Max-Age=2\x7F'

group('isCTLExcludingHtab', () => {
  bench(valid, () => {
    isCTLExcludingHtab(valid)
    isCTLExcludingHtab(invalid)
  })
})

await run()
