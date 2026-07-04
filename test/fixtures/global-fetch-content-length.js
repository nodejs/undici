'use strict'

// Exercising Node's *global* fetch/Headers against the dispatcher bridge
// is the point. See https://github.com/nodejs/undici/issues/5500
/* eslint-disable no-restricted-globals */

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
