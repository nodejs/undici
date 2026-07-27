'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { createServer, constants } = require('node:http2')
const { once } = require('node:events')
const { Readable } = require('node:stream')
const { Agent } = require('..')

async function createDispatcher (t, onStream) {
  const server = createServer()
  server.on('stream', onStream)
  server.listen(0)
  await once(server, 'listening')

  const dispatcher = new Agent({ connections: 1, useH2c: true })
  t.after(async () => {
    await dispatcher.close()
    server.close()
  })

  return {
    dispatcher,
    origin: `http://localhost:${server.address().port}`
  }
}

function refuse (stream, code = constants.NGHTTP2_REFUSED_STREAM) {
  stream.on('error', () => {})
  stream.close(code)
}

test('retries REFUSED_STREAM once before response headers', async (t) => {
  let streams = 0
  const { dispatcher, origin } = await createDispatcher(t, (stream) => {
    streams++

    if (streams === 1) {
      refuse(stream)
      return
    }

    stream.respond({ ':status': 200 })
    stream.end('ok')
  })

  const response = await dispatcher.request({ origin, path: '/', method: 'GET' })

  assert.strictEqual(response.statusCode, 200)
  assert.strictEqual(await response.body.text(), 'ok')
  assert.strictEqual(streams, 2)
})

test('retries REFUSED_STREAM while another stream is running', async (t) => {
  let retryStreams = 0
  const { dispatcher, origin } = await createDispatcher(t, (stream, headers) => {
    if (headers[':path'] === '/slow') {
      setTimeout(() => {
        stream.respond({ ':status': 200 })
        stream.end('slow')
      }, 20)
      return
    }

    retryStreams++
    if (retryStreams === 1) {
      refuse(stream)
      return
    }

    stream.respond({ ':status': 200 })
    stream.end('retried')
  })

  const slow = dispatcher
    .request({ origin, path: '/slow', method: 'GET' })
    .then(response => response.body.text())
  const retried = dispatcher
    .request({ origin, path: '/retry', method: 'GET' })
    .then(response => response.body.text())

  assert.deepStrictEqual(await Promise.all([slow, retried]), ['slow', 'retried'])
  assert.strictEqual(retryStreams, 2)
})

test('replays a buffered POST after REFUSED_STREAM', async (t) => {
  let streams = 0
  const received = []
  const { dispatcher, origin } = await createDispatcher(t, (stream) => {
    streams++

    if (streams === 1) {
      refuse(stream)
      return
    }

    const chunks = []
    stream.on('data', chunk => chunks.push(chunk))
    stream.on('end', () => {
      received.push(Buffer.concat(chunks).toString())
      stream.respond({ ':status': 200 })
      stream.end('ok')
    })
  })

  const response = await dispatcher.request({
    origin,
    path: '/',
    method: 'POST',
    body: Buffer.from('payload')
  })

  assert.strictEqual(await response.body.text(), 'ok')
  assert.deepStrictEqual(received, ['payload'])
  assert.strictEqual(streams, 2)
})

test('does not retry REFUSED_STREAM more than once', async (t) => {
  let streams = 0
  const { dispatcher, origin } = await createDispatcher(t, (stream) => {
    streams++

    if (streams <= 2) {
      refuse(stream)
      return
    }

    stream.respond({ ':status': 200 })
    stream.end('ok')
  })

  await assert.rejects(
    dispatcher.request({ origin, path: '/', method: 'GET' }),
    error => {
      assert.strictEqual(error.code, 'ERR_HTTP2_STREAM_ERROR')
      assert.strictEqual(error.http2ErrorCode, constants.NGHTTP2_REFUSED_STREAM)
      return true
    }
  )
  assert.strictEqual(streams, 2)

  const response = await dispatcher.request({ origin, path: '/', method: 'GET' })
  assert.strictEqual(await response.body.text(), 'ok')
  assert.strictEqual(streams, 3)
})

test('does not retry REFUSED_STREAM with a streaming body', async (t) => {
  let streams = 0
  const { dispatcher, origin } = await createDispatcher(t, (stream) => {
    streams++
    refuse(stream)
  })

  await assert.rejects(
    dispatcher.request({
      origin,
      path: '/',
      method: 'POST',
      body: Readable.from(['payload'])
    }),
    error => {
      assert.strictEqual(error.http2ErrorCode, constants.NGHTTP2_REFUSED_STREAM)
      return true
    }
  )
  assert.strictEqual(streams, 1)
})

test('does not retry other HTTP/2 stream errors', async (t) => {
  let streams = 0
  const { dispatcher, origin } = await createDispatcher(t, (stream) => {
    streams++
    refuse(stream, constants.NGHTTP2_PROTOCOL_ERROR)
  })

  await assert.rejects(
    dispatcher.request({ origin, path: '/', method: 'GET' }),
    error => {
      assert.strictEqual(error.http2ErrorCode, constants.NGHTTP2_PROTOCOL_ERROR)
      return true
    }
  )
  assert.strictEqual(streams, 1)
})
