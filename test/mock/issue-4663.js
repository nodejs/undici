'use strict'

// Regression test for https://github.com/nodejs/undici/issues/4663
// "SnapshotAgent in playback mode errors when it encounters an excluded url".
//
// When a URL is listed in excludeUrls it must not be matched against recorded
// snapshots during playback; instead the request should pass through to the
// real network unchanged.

const { describe, it } = require('node:test')
const assert = require('node:assert')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { unlink } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { SnapshotAgent, setGlobalDispatcher, getGlobalDispatcher, request } = require('../..')

function snapshotPath (suffix) {
  return join(tmpdir(), `undici-issue-4663-${suffix}-${process.pid}-${Date.now()}.json`)
}

async function startLiveServer (t) {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end(`live:${req.url}`)
  }).listen(0)
  await once(server, 'listening')
  t.after(() => {
    server.closeAllConnections?.()
    server.close()
  })
  const { port } = server.address()
  return `http://127.0.0.1:${port}`
}

function restoreGlobalDispatcher (t) {
  const original = getGlobalDispatcher()
  t.after(() => setGlobalDispatcher(original))
}

describe('SnapshotAgent - issue #4663', () => {
  it('playback does not throw for a URL matched by a string excludeUrls entry', async (t) => {
    const origin = await startLiveServer(t)
    const file = snapshotPath('string')
    t.after(() => unlink(file).catch(() => {}))
    restoreGlobalDispatcher(t)

    // Record phase - capture /kept, exclude /skipped.
    const recorder = new SnapshotAgent({
      mode: 'record',
      snapshotPath: file,
      excludeUrls: [`${origin}/skipped`]
    })
    t.after(async () => recorder.close())
    setGlobalDispatcher(recorder)

    await (await request(`${origin}/kept`)).body.text()
    await (await request(`${origin}/skipped`)).body.text()
    await recorder.saveSnapshots()

    assert.strictEqual(
      recorder.getRecorder().size(),
      1,
      'only the non-excluded URL should be recorded'
    )

    // Playback phase - the excluded URL must fall through to the live server
    // instead of throwing "No snapshot found".
    const playback = new SnapshotAgent({
      mode: 'playback',
      snapshotPath: file,
      excludeUrls: [`${origin}/skipped`]
    })
    t.after(async () => playback.close())
    setGlobalDispatcher(playback)

    const kept = await request(`${origin}/kept`)
    assert.strictEqual(kept.statusCode, 200)
    assert.strictEqual(await kept.body.text(), 'live:/kept')

    // This used to throw "UndiciError: No snapshot found for GET /skipped".
    const skipped = await request(`${origin}/skipped`)
    assert.strictEqual(
      skipped.statusCode,
      200,
      'excluded URL must be served by the live network, not error'
    )
    assert.strictEqual(await skipped.body.text(), 'live:/skipped')
  })

  it('playback does not throw for a URL matched by a RegExp excludeUrls entry', async (t) => {
    const origin = await startLiveServer(t)
    const file = snapshotPath('regex')
    t.after(() => unlink(file).catch(() => {}))
    restoreGlobalDispatcher(t)

    const excludeUrls = [/\/skip\/.+/]

    const recorder = new SnapshotAgent({
      mode: 'record',
      snapshotPath: file,
      excludeUrls
    })
    t.after(async () => recorder.close())
    setGlobalDispatcher(recorder)

    await (await request(`${origin}/kept`)).body.text()
    await (await request(`${origin}/skip/a`)).body.text()
    await recorder.saveSnapshots()

    assert.strictEqual(recorder.getRecorder().size(), 1)

    const playback = new SnapshotAgent({
      mode: 'playback',
      snapshotPath: file,
      excludeUrls
    })
    t.after(async () => playback.close())
    setGlobalDispatcher(playback)

    // Different excluded path than the recording phase - the regexp still
    // matches and the request must pass through to the live server.
    const res = await request(`${origin}/skip/b`)
    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(await res.body.text(), 'live:/skip/b')
  })
})
