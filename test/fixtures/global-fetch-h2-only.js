'use strict'

const { createSecureServer } = require('node:http2')
const { once } = require('node:events')
const pem = require('@metcoder95/https-pem')
const { Agent, Pool, setGlobalDispatcher } = require('../..')

async function main () {
  let factoryCalls = 0
  let streams = 0
  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  const dispatcher = new Agent({
    connect: {
      rejectUnauthorized: false
    },
    factory (origin, options) {
      factoryCalls++
      return new Pool(origin, {
        ...options,
        connections: 5
      })
    }
  })

  server.on('stream', (stream) => {
    streams++
    stream.respond({
      ':status': 200,
      'content-type': 'text/plain'
    })
    stream.end('ok')
  })

  try {
    server.listen(0)
    await once(server, 'listening')
    setGlobalDispatcher(dispatcher)

    // This fixture specifically verifies Node.js's built-in fetch.
    // eslint-disable-next-line no-restricted-globals
    const response = await fetch(`https://localhost:${server.address().port}`)
    const body = await response.text()

    process.stdout.write(JSON.stringify({
      body,
      factoryCalls,
      streams
    }))
  } finally {
    try {
      await dispatcher.close()
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  }
}

main().catch((err) => {
  console.error(err?.cause?.stack || err?.stack || err)
  process.exitCode = 1
})
