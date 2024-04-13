import { bench, run } from 'mitata'
import { isValidHeaderValue } from '../../lib/web/fetch/util.js'

const valid = 'valid123'
const invalidNUL = 'invalid\x00'
const invalidCR = 'invalid\r'
const invalidLF = 'invalid\n'
const invalidTrailingTab = 'invalid\t'
const invalidLeadingTab = '\tinvalid'
const invalidTrailingSpace = 'invalid '
const invalidLeadingSpace = ' invalid'

bench('isValidHeaderValue valid', () => {
  isValidHeaderValue(valid)
})
bench('isValidHeaderValue invalid containing NUL', () => {
  isValidHeaderValue(invalidNUL)
})
bench('isValidHeaderValue invalid containing CR', () => {
  isValidHeaderValue(invalidCR)
})
bench('isValidHeaderValue invalid containing LF', () => {
  isValidHeaderValue(invalidLF)
})
bench('isValidHeaderValue invalid trailing TAB', () => {
  isValidHeaderValue(invalidTrailingTab)
})
bench('isValidHeaderValue invalid leading TAB', () => {
  isValidHeaderValue(invalidLeadingTab)
})
bench('isValidHeaderValue invalid trailing SPACE', () => {
  isValidHeaderValue(invalidTrailingSpace)
})
bench('isValidHeaderValue invalid leading SPACE', () => {
  isValidHeaderValue(invalidLeadingSpace)
})

await run()
