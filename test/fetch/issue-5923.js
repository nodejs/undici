'use strict'

const { test } = require('node:test')
const { setTimeout: sleep } = require('node:timers/promises')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { FormData, Response, fetch } = require('../..')

// https://github.com/nodejs/undici/issues/5923
// Since #4791, extractBody eagerly reads every FormData Blob part into the
// body stream's queue. A Blob.stream() that only yields when pulled must
// not be drained until the consumer actually reads.

function fileWithTrackedStream (totalSize, chunkSize = 64 * 1024) {
  const file = new File([new Uint8Array(1)], 'big.bin', {
    type: 'application/octet-stream'
  })
  let bytesPulled = 0
  file.stream = () => new ReadableStream({
    pull (controller) {
      if (bytesPulled >= totalSize) {
        controller.close()
        return
      }
      const size = Math.min(chunkSize, totalSize - bytesPulled)
      bytesPulled += size
      controller.enqueue(new Uint8Array(size))
    }
  })
  return {
    file,
    get bytesPulled () {
      return bytesPulled
    }
  }
}

test('FormData does not read Blob parts until the body stream is pulled', async (t) => {
  const totalSize = 4 * 1024 * 1024
  const tracked = fileWithTrackedStream(totalSize)
  const form = new FormData()
  form.append('file', tracked.file)

  const response = new Response(form)
  await sleep(200)

  t.assert.strictEqual(
    tracked.bytesPulled,
    0,
    'Blob.stream() must not be drained before the body is read'
  )

  const reader = response.body.getReader()
  t.after(() => reader.cancel().catch(() => {}))

  // Pull until the first Blob chunk is requested.
  while (tracked.bytesPulled === 0) {
    const { done } = await reader.read()
    t.assert.ok(!done)
  }

  const afterFirstBlobChunk = tracked.bytesPulled
  t.assert.ok(
    afterFirstBlobChunk < totalSize,
    `expected a partial read, got ${afterFirstBlobChunk}`
  )

  await sleep(200)
  t.assert.strictEqual(
    tracked.bytesPulled,
    afterFirstBlobChunk,
    'must not keep reading Blob parts while the consumer is not pulling'
  )
})

test('FormData body errors when a Blob part stream fails', async (t) => {
  const file = new File([new Uint8Array(1)], 'x.bin')
  file.stream = () => new ReadableStream({
    pull (controller) {
      controller.error(new DOMException('The requested file could not be read', 'NotReadableError'))
    }
  })
  const form = new FormData()
  form.append('file', file)

  await t.assert.rejects(
    new Response(form).text(),
    (err) => err.name === 'NotReadableError'
  )
})

test('fetch still sends a FormData body with a Blob part', { timeout: 15000 }, async (t) => {
  const payload = Buffer.from('hello-formdata-backpressure')
  let received = Buffer.alloc(0)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    req.on('data', (chunk) => {
      received = Buffer.concat([received, chunk])
    })
    req.on('end', () => {
      res.end('ok')
    })
  })
  t.after(() => {
    server.closeAllConnections?.()
    server.close()
  })

  server.listen(0)
  await once(server, 'listening')

  const form = new FormData()
  form.append('file', new File([payload], 'hello.bin'))

  const response = await fetch(`http://127.0.0.1:${server.address().port}/`, {
    method: 'POST',
    body: form
  })
  t.assert.strictEqual(await response.text(), 'ok')
  t.assert.ok(received.includes(payload))
  t.assert.ok(received.includes(Buffer.from('hello.bin')))
})
