import { bench, run } from 'mitata'
import { isValidEncodedURL } from '../../lib/web/fetch/util.js'

const validUrl = 'https://example.com'
const invalidUrl = 'https://example.com\x00'

bench('isValidEncodedURL valid', () => {
  isValidEncodedURL(validUrl)
})
bench('isValidEncodedURL invalid', () => {
  isValidEncodedURL(invalidUrl)
})

await run()
