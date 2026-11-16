'use strict'

const { test, after } = require('node:test')
const assert = require('node:assert')
const { createServer, constants } = require('node:http2')
const { once } = require('node:events')
const { Agent, request } = require('..')

// https://github.com/nodejs/undici/issues/6064
// The server retires each session with GOAWAY every 8 streams while the client
// keeps 4 requests in flight. Requests dispatched around the GOAWAY race it, so
// some streams are opened before the client sees the GOAWAY but flushed after.
// Each of them must be replayed on a new connection instead of failing.
async function run (retire) {
  let streams = 0
  const server = createServer()
  server.on('session', (session) => session.on('error', () => {}))
  server.on('stream', (stream) => {
    stream.on('error', () => {})
    streams += 1
    if (streams % 8 === 0) {
      retire(stream)
    } else {
      stream.respond({ ':status': 200 })
      stream.end('ok')
    }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  after(() => server.close())

  const origin = `http://127.0.0.1:${server.address().port}`
  const agent = new Agent({ connections: 1, useH2c: true, h2Options: { maxConcurrentStreams: 4 } })
  after(() => agent.destroy())

  const failures = []
  let next = 0
  const worker = async () => {
    while (next < 400) {
      try {
        const res = await request(`${origin}/r${next++}`, { dispatcher: agent, signal: AbortSignal.timeout(5000) })
        await res.body.text()
      } catch (err) {
        failures.push(`${err.code ?? err.name}: ${err.message}`)
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))

  assert.deepStrictEqual(failures, [])
}

test('Should replay requests racing a GOAWAY with lastStreamID = 0', async () => {
  await run((stream) => {
    stream.respond({ ':status': 200 })
    stream.end('ok')
    stream.session.goaway(constants.NGHTTP2_NO_ERROR, 0)
  })
})

// What hyper, Go and nghttp2 servers do: GOAWAY(2^31-1) and a PING as a shutdown
// notice, then on the PING ack a final GOAWAY with the last processed stream.
// Streams opened after the notice are either refused by the client's own
// nghttp2 before being sent, or above the final lastStreamID.
test('Should replay requests racing a graceful GOAWAY with lastStreamID = 2^31-1', async () => {
  await run((stream) => {
    const session = stream.session
    session.goaway(constants.NGHTTP2_NO_ERROR, 2 ** 31 - 1)
    // Keep this stream open until the final GOAWAY so the server keeps reading.
    session.ping(() => {
      if (session.destroyed) return
      session.goaway(constants.NGHTTP2_NO_ERROR, session.state.lastProcStreamID)
      stream.respond({ ':status': 200 })
      stream.end('ok')
      stream.on('close', () => session.close())
    })
  })
})
