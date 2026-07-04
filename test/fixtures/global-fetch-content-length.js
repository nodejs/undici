'use strict'

// This fixture must use Node's *global* fetch and Headers — exercising the
// bundled fetch against the installed undici's dispatcher bridge is the point.
/* eslint-disable no-restricted-globals */

// Regression fixture for https://github.com/nodejs/undici/issues/5500.
// Requiring undici installs the legacy global-dispatcher bridge; Node's
// bundled fetch (undici v6/v7) then dispatches through it and produces an
// identical comma-repeated content-length (e.g. "13, 13") when the request
// sets its own Content-Length header.
require('../..')

const http = require('node:http')
const { once } = require('node:events')

async function main () {
  const server = http.createServer((req, res) => {
    let length = 0
    req.on('data', (chunk) => { length += chunk.length })
    req.on('end', () => res.end(String(length)))
  })
  server.listen(0)
  await once(server, 'listening')

  try {
    const body = 'update=INSERT'
    const headers = new Headers()
    headers.append('Content-Type', 'application/x-www-form-urlencoded')
    headers.append('Content-Length', String(body.length))

    const url = 'http://127.0.0.1:' + server.address().port
    const res = await fetch(url, { method: 'POST', headers, body })
    process.stdout.write(await res.text())
  } finally {
    server.close()
  }
}

main().catch((err) => {
  console.error(err?.cause?.stack || err?.stack || err)
  process.exitCode = 1
})
