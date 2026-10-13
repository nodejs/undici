'use strict'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const { createSecureServer } = require('node:http2')
const { once } = require('node:events')
const pem = require('@metcoder95/https-pem')
const { Agent, setGlobalDispatcher } = require('../..')

async function main () {
  const server = createSecureServer({
    key: pem.key,
    cert: pem.cert,
    allowHTTP1: true
  }, (request, response) => {
    if (request.url === '/redirect') {
      response.writeHead(302, { location: '/final' })
      response.end('redirect')
      return
    }

    response.writeHead(200, { 'x-final': 'true' })
    response.end('ok')
  })
  const agent = new Agent()

  try {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    setGlobalDispatcher(agent)

    const url = `https://127.0.0.1:${server.address().port}/redirect`
    // This fixture specifically verifies Node.js's built-in fetch.
    // eslint-disable-next-line no-restricted-globals
    const response = await fetch(url)
    const body = await response.text()

    process.stdout.write(JSON.stringify({
      status: response.status,
      redirected: response.redirected,
      finalPath: new URL(response.url).pathname,
      finalHeader: response.headers.get('x-final'),
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
