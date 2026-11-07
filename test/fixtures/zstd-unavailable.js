'use strict'

// Regression fixture: zstd support landed in Node 22.19.0/23.4.0, so `node:zlib`
// may not expose the zstd APIs on runtimes this package still supports.
// Hiding them here reproduces that shape on any Node version, so the test does
// not depend on the runner being old.

const zlib = require('node:zlib')
const { createServer } = require('node:http')
const { once } = require('node:events')

for (const name of ['createZstdCompress', 'createZstdDecompress', 'zstdCompressSync', 'zstdDecompressSync']) {
  Object.defineProperty(zlib, name, { value: undefined, configurable: true })
}
for (const name of ['ZSTD_c_compressionLevel', 'ZSTD_d_windowLogMax', 'ZSTD_e_continue', 'ZSTD_e_end']) {
  Object.defineProperty(zlib.constants, name, { value: undefined, configurable: true })
}

if (typeof zlib.createZstdDecompress !== 'undefined') {
  throw new Error('fixture failed to hide zstd')
}

// Loading undici must not throw even though the zstd APIs are missing.
const { request, Client } = require('../..')
const createDecompressInterceptor = require('../../lib/interceptor/decompress')

async function main () {
  if (createDecompressInterceptor.isZstdSupported() !== false) {
    throw new Error('isZstdSupported() should be false')
  }

  const gzip = zlib.createGzip()
  const server = createServer((req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Content-Encoding': 'gzip'
    })
    gzip.pipe(res)
    gzip.end('still works without zstd')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')

  try {
    const client = new Client(`http://127.0.0.1:${server.address().port}`)
      .compose(createDecompressInterceptor())
    try {
      const { body, headers } = await client.request({ path: '/', method: 'GET' })
      const text = await body.text()
      if (text !== 'still works without zstd') {
        throw new Error(`unexpected body: ${JSON.stringify(text)}`)
      }
      if (headers['content-encoding'] !== undefined) {
        throw new Error('content-encoding should have been removed after inflating')
      }
    } finally {
      await client.close()
    }
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }

  // The plain `request` API must be usable too: reach a closed port and expect a
  // connection error rather than a TypeError from loading the module.
  const plain = await request('http://127.0.0.1:1/', { method: 'GET' }).catch((err) => err)
  if (plain instanceof TypeError) {
    throw new Error(`request() threw a TypeError: ${plain.message}`)
  }
  if (!(plain instanceof Error)) {
    throw new Error('expected request() to a closed port to reject')
  }

  console.log('ok')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
