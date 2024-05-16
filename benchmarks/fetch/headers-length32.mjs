import { bench, run } from 'mitata'
import { Headers, getHeadersList } from '../../lib/web/fetch/headers.js'

const headers = new Headers(
  [
    'Origin-Agent-Cluster',
    'RTT',
    'Accept-CH-Lifetime',
    'X-Frame-Options',
    'Sec-CH-UA-Platform-Version',
    'Digest',
    'Cache-Control',
    'Sec-CH-UA-Platform',
    'If-Range',
    'SourceMap',
    'Strict-Transport-Security',
    'Want-Digest',
    'Cross-Origin-Resource-Policy',
    'Width',
    'Accept-CH',
    'Via',
    'Set-Cookie',
    'Server',
    'Sec-Fetch-Dest',
    'Sec-CH-UA-Model',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers',
    'Date',
    'Expires',
    'DNT',
    'Proxy-Authorization',
    'Alt-Svc',
    'Alt-Used',
    'ETag',
    'Sec-Fetch-User',
    'Sec-CH-UA-Full-Version-List',
    'Referrer-Policy'
  ].map((v) => [v, ''])
)

const headersList = getHeadersList(headers)

const kHeadersSortedMap = Reflect.ownKeys(headersList).find(
  (c) => String(c) === 'Symbol(headers map sorted)'
)

bench('Headers@@iterator', () => {
  headersList[kHeadersSortedMap] = null
  return [...headers]
})

await run()
