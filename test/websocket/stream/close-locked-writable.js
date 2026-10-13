'use strict'

const { test } = require('node:test')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const { join } = require('node:path')
const { WebSocketServer } = require('ws')

function waitForExit (child, timeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Child process did not exit after the WebSocket closed'))
    }, timeout)

    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })

    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      resolve({ code, signal })
    })
  })
}

async function testLockedWritableClose (t, clean) {
  const server = new WebSocketServer({ port: 0 })
  await once(server, 'listening')

  const connection = new Promise((resolve) => {
    server.once('connection', resolve)
  })

  const undici = join(__dirname, '../../..')
  const url = `ws://127.0.0.1:${server.address().port}`
  const child = spawn(process.execPath, ['--unhandled-rejections=strict', '-e', `
    const assert = require('node:assert')
    const { WebSocketStream } = require(${JSON.stringify(undici)})

    ;(async () => {
      const stream = new WebSocketStream(${JSON.stringify(url)})
      const { writable } = await stream.opened
      const writer = writable.getWriter()
      const writerClosed = writer.closed.catch((error) => error)
      process.stdout.write('locked\\n')

      const closeResult = await stream.closed.then(
        (value) => ({ value }),
        (error) => ({ error })
      )
      const writerError = await writerClosed

      if (${clean}) {
        assert.deepStrictEqual(closeResult.value, { closeCode: 1000, reason: '' })
        assert.strictEqual(writerError.name, 'InvalidStateError')
      } else {
        assert.strictEqual(writerError, closeResult.error)
        assert.strictEqual(closeResult.error.name, 'WebSocketError')
        assert.strictEqual(closeResult.error.closeCode, 1006)
      }

      writer.releaseLock()
      await new Promise((resolve) => setTimeout(resolve, 50))
      process.stdout.write('survived\\n')
    })().catch((error) => {
      console.error(error)
      process.exitCode = 2
    })
  `], {
    stdio: ['ignore', 'pipe', 'pipe']
  })

  t.after(() => {
    child.kill()

    for (const client of server.clients) {
      client.terminate()
    }

    server.close()
  })

  let stdout = ''
  let stderr = ''
  let terminated = false

  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    stdout += chunk

    if (!terminated && stdout.includes('locked\n')) {
      terminated = true
      connection.then((socket) => clean ? socket.close(1000) : socket.terminate())
    }
  })

  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })

  const { code, signal } = await waitForExit(child, 5000)

  t.assert.strictEqual(code, 0, stderr)
  t.assert.strictEqual(signal, null)
  t.assert.strictEqual(stdout, 'locked\nsurvived\n')
}

test('unclean close errors a locked writable without terminating the process', async (t) => {
  await testLockedWritableClose(t, false)
})

test('clean close errors a locked writable without terminating the process', async (t) => {
  await testLockedWritableClose(t, true)
})
