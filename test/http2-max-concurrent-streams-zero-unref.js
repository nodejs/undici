'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createSecureServer } = require('node:http2')
const { once } = require('node:events')
const { fork } = require('node:child_process')
const { join } = require('node:path')

const pem = require('@metcoder95/https-pem')

// resumeH2() unreffed the socket and session whenever the peer advertised
// SETTINGS_MAX_CONCURRENT_STREAMS = 0 -- which a peer may legitimately do to
// refuse new streams (RFC 9113 6.5.2) -- including while requests were still
// queued. A queued request owns no handle and arms no timer of its own, so
// nothing was left holding the event loop open: the process exited with status
// 0 while an awaited request never settled, and the line after the await never
// ran.
test('a queued request keeps the process alive when the peer allows no streams', async t => {
  t = tspl(t, { plan: 2 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))

  server.on('stream', (stream) => {
    stream.on('error', () => {})
    stream.respond({ ':status': 200 })
    stream.end('ok')
  })

  // Serve one request, then refuse any further streams.
  server.on('session', (session) => {
    session.once('stream', () => {
      setTimeout(() => {
        try {
          session.settings({ maxConcurrentStreams: 0 })
        } catch {}
      }, 50)
    })
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const child = fork(
    join(__dirname, 'fixtures', 'h2-no-streams-client.js'),
    [String(server.address().port)],
    { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] }
  )
  after(() => child.kill('SIGKILL'))

  let stdout = ''
  child.stdout.on('data', (c) => { stdout += c })
  child.stderr.on('data', () => {})

  await once(child, 'message') // warm-up done, the drain SETTINGS have landed

  // Still being alive is the pass condition: the request is outstanding, so the
  // process must not have concluded it had nothing left to do.
  let timer
  const code = await Promise.race([
    once(child, 'exit').then(([code]) => code),
    new Promise((resolve) => { timer = setTimeout(() => resolve('still running'), 5000) })
  ]).finally(() => clearTimeout(timer))

  t.notStrictEqual(code, 0, 'the process exited cleanly with a request still outstanding')
  t.ok(!stdout.includes('UNREACHABLE'), 'the queued request must not appear to succeed')

  await t.completed
})
