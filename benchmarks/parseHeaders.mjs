import { bench, group, run } from 'mitata'
import { parseHeaders } from './lib/core/util.js'

const headers = Object.entries({
  'Content-Type': 'application/json',
  Date: 'Wed, 01 Nov 2023 00:00:00 GMT',
  'Powered-By': 'NodeJS',
  'Content-Encoding': 'gzip',
  'Set-Cookie': '__Secure-ID=123; Secure; Domain=example.com',
  'Content-Length': '150',
  Vary: 'Accept-Encoding, Accept, X-Requested-With'
}).flat().map(c => Buffer.from(c))

const headersIrregular = Object.entries({
  'Content-type': 'application/json',
  DaTe: 'Wed, 01 Nov 2023 00:00:00 GMT',
  'Powered-by': 'NodeJS',
  'Content-encoding': 'gzip',
  'Set-cookie': '__Secure-ID=123; Secure; Domain=example.com',
  'Content-length': '150',
  VaRy: 'Accept-Encoding, Accept, X-Requested-With'
}).flat().map(c => Buffer.from(c))

// avoid JIT bias
bench('noop', () => {})
bench('noop', () => {})
bench('noop', () => {})
bench('noop', () => {})
bench('noop', () => {})
bench('noop', () => {})

group('parseHeaders', () => {
  bench('default', () => {
    parseHeaders(headers, undefined, false)
  })
  bench('allowUnsafe', () => {
    parseHeaders(headers, undefined, true)
  })
})

group('parseHeaders (irregular)', () => {
  bench('default', () => {
    parseHeaders(headersIrregular, undefined, false)
  })
  bench('allowUnsafe', () => {
    parseHeaders(headersIrregular, undefined, true)
  })
})

await new Promise((resolve) => setTimeout(resolve, 7000))

await run()
