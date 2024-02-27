import { bench, group, run } from 'mitata'
import { parseHeaders } from '../../lib/core/util.js'

const target = [
  {
    'Content-Type': 'application/json',
    Date: 'Wed, 01 Nov 2023 00:00:00 GMT',
    'Powered-By': 'NodeJS',
    'Content-Encoding': 'gzip',
    'Set-Cookie': '__Secure-ID=123; Secure; Domain=example.com',
    'Content-Length': '150',
    Vary: 'Accept-Encoding, Accept, X-Requested-With'
  },
  {
    'Content-Type': 'text/html; charset=UTF-8',
    'Content-Length': '1234',
    Date: 'Wed, 06 Dec 2023 12:47:57 GMT',
    Server: 'Bing'
  },
  {
    'Content-Type': 'image/jpeg',
    'Content-Length': '56789',
    Date: 'Wed, 06 Dec 2023 12:48:12 GMT',
    Server: 'Bing',
    ETag: '"a1b2c3d4e5f6g7h8i9j0"'
  },
  {
    Cookie: 'session_id=1234567890abcdef',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    Host: 'www.bing.com',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br'
  },
  {
    Location: 'https://www.bing.com/search?q=bing',
    Status: '302 Found',
    Date: 'Wed, 06 Dec 2023 12:48:27 GMT',
    Server: 'Bing',
    'Content-Type': 'text/html; charset=UTF-8',
    'Content-Length': '0'
  },
  {
    'Content-Type':
      'multipart/form-data; boundary=----WebKitFormBoundary1234567890',
    'Content-Length': '98765',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    Host: 'www.bing.com',
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br'
  },
  {
    'Content-Type': 'application/json; charset=UTF-8',
    'Content-Length': '2345',
    Date: 'Wed, 06 Dec 2023 12:48:42 GMT',
    Server: 'Bing',
    Status: '200 OK',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  },
  {
    Host: 'www.example.com',
    Connection: 'keep-alive',
    Accept: 'text/html, application/xhtml+xml, application/xml;q=0.9,;q=0.8',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
  }
]

const headers = Array.from(target, (x) =>
  Object.entries(x)
    .flat()
    .map((c) => Buffer.from(c))
)

const headersIrregular = Array.from(
  target,
  (x) => Object.entries(x)
    .flat()
    .map((c) => Buffer.from(c.toUpperCase()))
)

// avoid JIT bias
bench('noop', () => {})
bench('noop', () => {})
bench('noop', () => {})
bench('noop', () => {})
bench('noop', () => {})
bench('noop', () => {})

group('parseHeaders', () => {
  bench('parseHeaders', () => {
    for (let i = 0; i < headers.length; ++i) {
      parseHeaders(headers[i])
    }
  })
  bench('parseHeaders (irregular)', () => {
    for (let i = 0; i < headersIrregular.length; ++i) {
      parseHeaders(headersIrregular[i])
    }
  })
})

await new Promise((resolve) => setTimeout(resolve, 7000))

await run()
