'use strict'

// WebSocketStream's opened and closed promises can reject without any user
// action (an abort signal, or an unclean close). Users often observe only one
// of them, or neither, so the rejections must not be reported as unhandled,
// which would crash the process. Anyone awaiting them must still see the
// rejection.
//
// Each case runs in a child process with --unhandled-rejections=strict, once
// for each way of marking the promises as handled:
//   - native:   util.markPromiseAsHandled() exists (stubbed here, since it
//               is only available from Node.js 26.10.0)
//   - fallback: util.markPromiseAsHandled() does not exist

const { test } = require('node:test')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const { join } = require('node:path')
const { WebSocketServer } = require('ws')

const undici = join(__dirname, '../../..')

// Code run in the child before undici is loaded.
const setup = {
  native: `
    const util = require('node:util')
    const marked = new Set()
    util.markPromiseAsHandled = (promise) => {
      marked.add(promise)
      promise.catch(() => {})
    }
    globalThis.checkMarked = (stream) => {
      assert.ok(marked.has(stream.opened), 'opened was marked with util.markPromiseAsHandled')
      assert.ok(marked.has(stream.closed), 'closed was marked with util.markPromiseAsHandled')
    }
  `,
  fallback: `
    delete require('node:util').markPromiseAsHandled
    assert.strictEqual(require('node:util').markPromiseAsHandled, undefined)
    globalThis.checkMarked = () => {}
  `
}

async function run (t, { api, server: serverBehaviour, body }) {
  const server = new WebSocketServer({ port: 0 })
  await once(server, 'listening')
  if (serverBehaviour === 'terminate') {
    // Drop the TCP connection without a closing handshake: an unclean close.
    server.on('connection', (socket) => setTimeout(() => socket.terminate(), 20))
  }

  const url = `ws://127.0.0.1:${server.address().port}`
  const child = spawn(process.execPath, ['--unhandled-rejections=strict', '--no-warnings', '-e', `
    const assert = require('node:assert')
    ${setup[api]}
    const { WebSocketStream } = require(${JSON.stringify(undici)})
    const url = ${JSON.stringify(url)}

    ;(async () => {
      ${body}

      // Give any unhandled rejection time to be reported.
      await new Promise((resolve) => setTimeout(resolve, 100))
      process.stdout.write('survived\\n')
    })().catch((error) => {
      console.error(error)
      process.exitCode = 2
    })
  `], { stdio: ['ignore', 'pipe', 'pipe'] })

  t.after(() => {
    child.kill()
    for (const client of server.clients) {
      client.terminate()
    }
    server.close()
  })

  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk })
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk })

  const timer = setTimeout(() => child.kill(), 5000)
  const [code, signal] = await once(child, 'exit')
  clearTimeout(timer)

  t.assert.strictEqual(signal, null, 'child exited on its own')
  t.assert.strictEqual(code, 0, stderr)
  t.assert.strictEqual(stdout, 'survived\n')
}

for (const api of ['native', 'fallback']) {
  test(`${api}: aborting without observing opened or closed does not crash`, async (t) => {
    await run(t, {
      api,
      body: `
        const ac = new AbortController()
        const stream = new WebSocketStream(url, { signal: ac.signal })
        ac.abort(new Error('user abort'))
        checkMarked(stream)
      `
    })
  })

  test(`${api}: an unclean close without observing closed does not crash`, async (t) => {
    await run(t, {
      api,
      server: 'terminate',
      body: `
        const stream = new WebSocketStream(url)
        checkMarked(stream)
        await stream.opened
        // Wait for the server to drop the connection.
        await new Promise((resolve) => setTimeout(resolve, 100))
      `
    })
  })

  test(`${api}: opened and closed still reject for anyone awaiting them`, async (t) => {
    await run(t, {
      api,
      body: `
        const ac = new AbortController()
        const stream = new WebSocketStream(url, { signal: ac.signal })
        const reason = new Error('user abort')
        ac.abort(reason)
        await assert.rejects(stream.opened, (error) => error === reason)
        await assert.rejects(stream.closed, (error) => error === reason)
      `
    })
  })
}
