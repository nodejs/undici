'use strict'

const assert = require('node:assert')
const { createSecureServer } = require('node:http2')
const { once } = require('node:events')
const { gzipSync, deflateSync, brotliCompressSync } = require('node:zlib')
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

  const encodings = { identity: body => body, gzip: gzipSync, deflate: deflateSync, br: brotliCompressSync }
  server.on('stream', (stream, headers) => {
    streams++
    const encoding = headers[':path'].slice(1)
    stream.respond({
      ':status': 200,
      'content-type': 'text/plain',
      'x-test-header': 'value',
      'set-cookie': ['a=1', 'b=2'],
      ...(encoding === 'identity' ? {} : { 'content-encoding': encoding })
    })
    stream.end(encodings[encoding]('ok'))
  })

  try {
    server.listen(0)
    await once(server, 'listening')
    setGlobalDispatcher(dispatcher)

    const bodies = []
    for (const encoding of Object.keys(encodings)) {
      // This fixture specifically verifies Node.js's built-in fetch.
      // eslint-disable-next-line no-restricted-globals
      const response = await fetch(`https://localhost:${server.address().port}/${encoding}`)
      const body = await response.text()
      assert.strictEqual(response.status, 200)
      assert.strictEqual(response.headers.get('content-type'), 'text/plain')
      assert.strictEqual(response.headers.get('x-test-header'), 'value')
      assert.strictEqual(response.headers.get('content-encoding'), encoding === 'identity' ? null : encoding)
      assert.deepStrictEqual(response.headers.getSetCookie(), ['a=1', 'b=2'])
      assert.strictEqual(body, 'ok')
      bodies.push(body)
    }

    process.stdout.write(JSON.stringify({
      bodies,
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
