'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { Readable } = require('node:stream')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { fetch } = require('../..')
const { closeServerAsPromise } = require('../utils/node-http')

const hasGC = typeof global.gc !== 'undefined'

// https://github.com/nodejs/undici/issues/4058
//
// Streaming a large upload used to buffer the whole body in memory. fetch clones
// the request to be able to follow redirects, and cloning teed the body's
// stream. A stream body has a null source and can never be replayed across a
// redirect (http-redirect-fetch returns a network error for a non-303 redirect
// with a null source, and otherwise re-extracts from the source), so the branch
// kept on the original request was never read - the tee just buffered the entire
// upload. arrayBuffers is the metric that exposes it (RSS/heap are noisy).
test('a streamed upload is not buffered in memory (#4058)', { timeout: 30000 }, async (t) => {
  if (!hasGC) {
    throw new Error('gc is not available. Run with \'--expose-gc\'.')
  }

  const chunkSize = 64 * 1024
  const totalChunks = 2048 // 128 MiB
  const bodySize = chunkSize * totalChunks

  let peakArrayBuffers = 0
  function sample () {
    global.gc()
    const { arrayBuffers } = process.memoryUsage()
    if (arrayBuffers > peakArrayBuffers) {
      peakArrayBuffers = arrayBuffers
    }
  }

  // Drain the upload server-side without buffering it, so the only thing that can
  // grow is the client's retained tee branch.
  const server = createServer((req, res) => {
    req.resume()
    req.on('end', () => res.end('ok'))
  })
  t.after(closeServerAsPromise(server))
  server.listen(0)
  await once(server, 'listening')

  // Yield to the event loop periodically so the producer can't race ahead of the
  // socket drain and transiently inflate arrayBuffers (which would flake the
  // threshold even with the fix). A fresh allocation per chunk is required -
  // reusing one buffer would let the retained branch hold references to the same
  // memory and mask the leak.
  async function * generate () {
    for (let i = 0; i < totalChunks; i++) {
      yield Buffer.allocUnsafe(chunkSize)
      if ((i + 1) % 64 === 0) {
        sample()
        await new Promise(resolve => setImmediate(resolve))
      }
    }
  }
  const body = Readable.from(generate())

  const res = await fetch(`http://127.0.0.1:${server.address().port}`, {
    method: 'PUT',
    body,
    duplex: 'half'
  })
  assert.strictEqual(await res.text(), 'ok')
  sample()

  // Without the fix the retained branch holds the whole body (~128 MiB). With it
  // nothing is retained, so the peak stays a small multiple of the chunk size.
  // A quarter of the body is a generous bound that is far above the fixed peak
  // and far below the broken one.
  assert.ok(
    peakArrayBuffers < bodySize / 4,
    `arrayBuffers peaked at ${(peakArrayBuffers / 1024 / 1024).toFixed(1)} MiB for a ${(bodySize / 1024 / 1024).toFixed(0)} MiB upload`
  )
})
