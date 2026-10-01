// In-memory end-to-end h1 response parsing benchmark: a Client whose connect
// returns a Duplex that answers every request with a canned response.
// node --expose-gc bench.mjs <undici root> [case]
import { createRequire } from 'node:module'
import { Duplex } from 'node:stream'
import { bench, run, summary } from 'mitata'

const root = process.argv[2]
const only = process.argv[3]
const require = createRequire(import.meta.url)
const { Client } = require(`${root}/index.js`)

const BODY = 'hello'
const RESPONSES = {
  // CDN asset: 20 names, 4 of them (cf-cache-status, cf-ray, nel, report-to)
  // outside the old well-known list.
  cdn: [
    'Date: Wed, 30 Sep 2026 12:00:00 GMT',
    'Content-Type: application/javascript; charset=utf-8',
    `Content-Length: ${BODY.length}`,
    'Connection: keep-alive',
    'Server: cloudflare',
    'Cache-Control: public, max-age=31536000, immutable',
    'ETag: "5f2b8c1e-4a7d"',
    'Last-Modified: Mon, 28 Sep 2026 08:14:02 GMT',
    'Accept-Ranges: bytes',
    'Vary: Accept-Encoding',
    'Age: 48213',
    'CF-Cache-Status: HIT',
    'CF-Ray: 8c9f2a1b3d4e5f60-ARN',
    'Alt-Svc: h3=":443"; ma=86400',
    'Strict-Transport-Security: max-age=31536000; includeSubDomains',
    'X-Content-Type-Options: nosniff',
    'Access-Control-Allow-Origin: *',
    'NEL: {"success_fraction":0,"report_to":"cf-nel","max_age":604800}',
    'Report-To: {"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4"}],"group":"cf-nel","max_age":604800}',
    'Timing-Allow-Origin: *'
  ],
  // Origin response: 16 names, all in both the old and the new list.
  origin: [
    'Date: Wed, 30 Sep 2026 12:00:00 GMT',
    'Content-Type: text/html; charset=utf-8',
    `Content-Length: ${BODY.length}`,
    'Connection: keep-alive',
    'Keep-Alive: timeout=5',
    'Server: nginx',
    'Cache-Control: no-cache',
    'ETag: W/"2a-1f3c"',
    'Last-Modified: Mon, 28 Sep 2026 08:14:02 GMT',
    'Accept-Ranges: bytes',
    'Vary: Accept-Encoding',
    'Age: 0',
    'Strict-Transport-Security: max-age=31536000',
    'X-Content-Type-Options: nosniff',
    'Access-Control-Allow-Origin: *',
    'Set-Cookie: sid=abc123; Path=/; HttpOnly'
  ],
  // CouchDB document read: 8 names, 2 of them new.
  couchdb: [
    'Cache-Control: must-revalidate',
    `Content-Length: ${BODY.length}`,
    'Content-Type: application/json',
    'Date: Wed, 30 Sep 2026 12:00:00 GMT',
    'ETag: "1-967a00dff5e02add41819138abb3284d"',
    'Server: CouchDB/3.3.3 (Erlang OTP/25)',
    'X-Couch-Request-ID: 8d2c6b3c1a',
    'X-CouchDB-Body-Time: 0'
  ],
  // S3 GetObject: 10 names, 4 of them new.
  s3: [
    'x-amz-id-2: eftixk72aD6Ap51TnqcoF8eFidJG9Z/2mkiDFu8yU9AS1ed4OpIszj7UDNEHGran',
    'x-amz-request-id: 318BC8BC148832E5',
    'Date: Wed, 30 Sep 2026 12:00:00 GMT',
    'Last-Modified: Mon, 28 Sep 2026 08:14:02 GMT',
    'ETag: "fba9dede5f27731c9771645a39863328"',
    'x-amz-server-side-encryption: AES256',
    'Accept-Ranges: bytes',
    'Content-Type: application/octet-stream',
    'Server: AmazonS3',
    `Content-Length: ${BODY.length}`
  ],
  // 30 names outside either list.
  custom: [
    ...Array.from({ length: 30 }, (_, i) => `X-Custom-Header-${i}: value-${i}`),
    `Content-Length: ${BODY.length}`
  ]
}

const BATCH = 1000

function makeClient (lines) {
  const response = Buffer.from(['HTTP/1.1 200 OK', ...lines, '', BODY].join('\r\n'), 'latin1')
  return new Client('http://localhost', {
    pipelining: 10,
    connect (opts, callback) {
      const socket = new Duplex({
        read () {},
        write (chunk, encoding, cb) {
          socket.push(response)
          cb()
        }
      })
      callback(null, socket)
    }
  })
}

function batch (client) {
  return new Promise((resolve, reject) => {
    let sent = 0
    let done = 0
    const handler = {
      onRequestStart () {},
      onResponseStart () {},
      onResponseData () {},
      onResponseEnd () {
        if (++done === BATCH) {
          resolve()
        } else if (sent < BATCH) {
          send()
        }
      },
      onResponseError (_controller, err) { reject(err) }
    }
    const send = () => {
      sent++
      client.dispatch({ path: '/', method: 'GET' }, handler)
    }
    for (let i = 0; i < 10; i++) {
      send()
    }
  })
}

const clients = []
for (const [name, lines] of Object.entries(RESPONSES)) {
  if (only && only !== name) {
    continue
  }
  const client = makeClient(lines)
  clients.push(client)
  await batch(client)
  summary(() => {
    bench(`${name} x${BATCH}`, () => batch(client)).gc('inner')
  })
}

const { benchmarks } = await run({ format: process.env.JSON ? 'quiet' : 'mitata' })
if (process.env.JSON) {
  for (const b of benchmarks) {
    const s = b.runs[0].stats
    console.log(JSON.stringify({ name: b.alias, avg: s.avg / BATCH, p50: s.p50 / BATCH, heap: s.heap ? s.heap.avg / BATCH : null }))
  }
}
for (const client of clients) {
  await client.close()
}
