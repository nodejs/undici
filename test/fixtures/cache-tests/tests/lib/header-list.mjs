export default [
  {
    name: 'Test-Header',
    reqUpdate: true
  },
  {
    name: 'X-Test-Header',
    reqUpdate: true
  },
  {
    name: 'Content-Foo',
    reqUpdate: true
  },
  {
    name: 'X-Content-Foo',
    reqUpdate: true
  },
  {
    name: 'Cache-Control',
    valA: 'max-age=1',
    valB: 'max-age=3600',
    reqUpdate: true
  },
  {
    name: 'Connection',
    noStore: true
  },
  {
    name: 'Content-Encoding'
  },
  {
    name: 'Content-Length',
    valA: '36',
    valB: '10',
    noUpdate: true,
    checkBody: false
  },
  {
    name: 'Content-Location',
    valA: '/foo',
    valB: '/bar'
  },
  {
    name: 'Content-MD5',
    valA: 'rL0Y20zC+Fzt72VPzMSk2A==',
    valB: 'N7UdGUp1E+RbVvZSTy1R8g=='
  },
  {
    name: 'Content-Range'
  },
  {
    name: 'Content-Security-Policy',
    valA: 'default-src \'self\'',
    valB: 'default-src \'self\' cdn.example.com'
  },
  {
    name: 'Content-Type',
    valA: 'text/plain',
    valB: 'text/plain;charset=utf-8'
  },
  {
    name: 'Clear-Site-Data',
    valA: 'cache',
    valB: 'cookies'
  },
  {
    name: 'ETag',
    valA: '"abcdef"',
    valB: '"ghijkl"'
  },
  {
    name: 'Expires',
    valA: 'Fri, 01 Jan 2038 01:01:01 GMT',
    valB: 'Mon, 11 Jan 2038 11:11:11 GMT'
  },
  {
    name: 'Keep-Alive',
    noStore: true
  },
  {
    name: 'Proxy-Authenticate',
    noStore: true
  },
  {
    name: 'Proxy-Authentication-Info',
    noStore: true
  },
  {
    name: 'Proxy-Authorization',
    noStore: true
  },
  {
    name: 'Proxy-Connection',
    noStore: true
  },
  {
    name: 'Public-Key-Pins'
  },
  {
    name: 'Set-Cookie',
    valA: 'a=b',
    valB: 'a=c'
  },
  {
    name: 'Set-Cookie2',
    valA: 'a=b',
    valB: 'a=c'
  },
  {
    name: 'TE',
    noStore: true
  },
  //  {
  //    name: 'Trailer',
  //    noStore: true
  //  },
  {
    name: 'Transfer-Encoding',
    noStore: true
  },
  {
    name: 'Upgrade',
    noStore: true
  },
  {
    name: 'X-Frame-Options',
    valA: 'deny',
    valB: 'sameorigin'
  },
  {
    name: 'X-XSS-Protection',
    valA: '1',
    valB: '1; mode=block'
  }
]
