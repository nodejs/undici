'use strict'

const { test } = require('node:test')
const { fork } = require('node:child_process')
const { once } = require('node:events')
const { createSecureServer } = require('node:http2')
const { join } = require('node:path')
const { key, cert } = require('@metcoder95/https-pem')

// A child process queues a request behind SETTINGS_MAX_CONCURRENT_STREAMS = 0 and must stay
// alive until the headersTimeout error. resumeH2() used to unref the session in that case,
// so the process exited with status 0 while the awaited request never settled.
test('a queued request keeps the process alive while the peer allows no new streams', { timeout: 10000 }, async (t) => {
  const server = createSecureServer({ key, cert })
  t.after(() => server.close())

  server.on('stream', (stream) => {
    stream.on('error', () => {})
    stream.respond({ ':status': 200 })
    stream.end('ok')
  })

  let session
  server.on('session', (s) => { session = s })

  server.listen(0)
  await once(server, 'listening')

  const child = fork(join(__dirname, 'fixtures/h2-no-streams-client.js'), [String(server.address().port)])
  t.after(() => child.kill())

  const messages = []
  child.on('message', (message) => {
    messages.push(message)

    if (message === 'warmed') {
      try {
        session.settings({ maxConcurrentStreams: 0 }, () => child.send('drained', () => {}))
      } catch {}
    }
  })

  const [code, signal] = await once(child, 'close')

  t.assert.strictEqual(signal, null)
  t.assert.strictEqual(code, 0)
  t.assert.deepStrictEqual(messages, ['warmed', 'queued', 'UND_ERR_HEADERS_TIMEOUT'])
})

test('a queued request keeps the process alive when the last stream closes', { timeout: 10000 }, async (t) => {
  const server = createSecureServer({ key, cert })
  t.after(() => server.close())

  let activeStream
  server.on('stream', (stream) => {
    stream.on('error', () => {})
    stream.respond({ ':status': 200 })
    activeStream = stream
  })

  let session
  server.on('session', (s) => { session = s })

  server.listen(0)
  await once(server, 'listening')

  const child = fork(join(__dirname, 'fixtures/h2-last-stream-client.js'), [String(server.address().port)])
  t.after(() => child.kill())

  const messages = []
  child.on('message', (message) => {
    messages.push(message)

    if (message === 'warmed') {
      try {
        session.settings({ maxConcurrentStreams: 0 }, () => child.send('drained', () => {}))
      } catch {}
    } else if (message === 'queued') {
      activeStream.end('ok')
    }
  })

  const [code, signal] = await once(child, 'close')

  t.assert.strictEqual(signal, null)
  t.assert.strictEqual(code, 0)
  t.assert.deepStrictEqual(messages, ['warmed', 'queued', 'UND_ERR_HEADERS_TIMEOUT'])
})
