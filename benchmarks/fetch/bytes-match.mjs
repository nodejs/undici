import { createHash } from 'node:crypto'
import { bench, run } from 'mitata'
import { bytesMatch } from '../../lib/web/fetch/util.js'

const body = Buffer.from('Hello world!')
const validSha256Base64 = `sha256-${createHash('sha256').update(body).digest('base64')}`
const invalidSha256Base64 = `sha256-${createHash('sha256').update(body).digest('base64')}`
const validSha256Base64Url = `sha256-${createHash('sha256').update(body).digest('base64url')}`
const invalidSha256Base64Url = `sha256-${createHash('sha256').update(body).digest('base64url')}`

bench('bytesMatch valid sha256 and base64', () => {
  bytesMatch(body, validSha256Base64)
})
bench('bytesMatch invalid sha256 and base64', () => {
  bytesMatch(body, invalidSha256Base64)
})
bench('bytesMatch valid sha256 and base64url', () => {
  bytesMatch(body, validSha256Base64Url)
})
bench('bytesMatch invalid sha256 and base64url', () => {
  bytesMatch(body, invalidSha256Base64Url)
})

await run()
