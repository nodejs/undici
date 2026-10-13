'use strict'

// Regression test for https://github.com/nodejs/undici/issues/5865
//
// When Node.js's built-in fetch goes through the legacy dispatcher bridge
// (Dispatcher1Wrapper -> LegacyHandlerWrapper) it used to negotiate HTTP/2 but
// forward the HTTP/2 controller's rawHeaders/rawTrailers **objects** to the
// legacy callbacks, which expect raw header arrays. This dropped response
// headers (notably `content-encoding`), so compressed bytes reached
// response.json() without being decompressed.
//
// This fixture specifically verifies Node.js's built-in fetch via the legacy
// bridge: response headers must be preserved and the gzip body must decode.

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const { createSecureServer } = require('node:http2')
const { once } = require('node:events')
const { gzipSync } = require('node:zlib')
const pem = require('@metcoder95/https-pem')
const { Agent, setGlobalDispatcher } = require('../..')

async function main () {
  const rawBody = JSON.stringify({ ok: true })
  const compressedBody = gzipSync(rawBody)

  // allowHTTP1 is required because the legacy bridge currently falls back to
  // HTTP/1.1 (the legacy consumers do not support HTTP/2).
  const server = createSecureServer({
    key: pem.key,
    cert: pem.cert,
    allowHTTP1: true
  })

  // The compat 'request' handler serves both HTTP/1.1 requests and HTTP/2
  // streams (via the http2 compat layer), regardless of the negotiated
  // protocol.
  server.on('request', (_request, response) => {
    response.writeHead(200, {
      'content-type': 'application/json',
      'content-encoding': 'gzip'
    })
    response.end(compressedBody)
  })

  const agent = new Agent({
    allowH2: true,
    connect: {
      rejectUnauthorized: false
    }
  })

  try {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    setGlobalDispatcher(agent)

    const url = `https://127.0.0.1:${server.address().port}/`
    // eslint-disable-next-line no-restricted-globals
    const response = await fetch(url)
    const contentEncoding = response.headers.get('content-encoding')
    const body = await response.json()

    process.stdout.write(JSON.stringify({
      status: response.status,
      contentEncoding,
      body
    }))
  } finally {
    await agent.close()
    await new Promise((resolve) => server.close(resolve))
  }
}

main().catch((err) => {
  console.error(err?.cause?.stack || err?.stack || err)
  process.exitCode = 1
})
