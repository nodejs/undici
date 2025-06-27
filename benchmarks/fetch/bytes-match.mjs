import { createHash } from 'node:crypto'
import { bench, run } from 'mitata'
import { bytesMatch, ByteSequence } from '../../lib/web/fetch/util.js'

const buffer = Buffer.from('Hello world!')
const bytes = new ByteSequence([buffer])
const validSha256Base64 = `sha256-${createHash('sha256').update(buffer).digest('base64')}`
const invalidSha256Base64 = `sha256-${createHash('sha256').update(buffer).digest('base64')}`
const validSha256Base64Url = `sha256-${createHash('sha256').update(buffer).digest('base64url')}`
const invalidSha256Base64Url = `sha256-${createHash('sha256').update(buffer).digest('base64url')}`

bench('bytesMatch valid sha256 and base64', () => {
  bytesMatch(bytes, validSha256Base64)
})
bench('bytesMatch invalid sha256 and base64', () => {
  bytesMatch(bytes, invalidSha256Base64)
})
bench('bytesMatch valid sha256 and base64url', () => {
  bytesMatch(bytes, validSha256Base64Url)
})
bench('bytesMatch invalid sha256 and base64url', () => {
  bytesMatch(bytes, invalidSha256Base64Url)
})

await run()
