'use strict'

const { test } = require('node:test')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const { join } = require('node:path')
const { WebSocketServer } = require('ws')

function waitForExit (child, timeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Child process did not exit after WebSocket was unrefed'))
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

test('process.unref allows the process to exit with an open WebSocket', async (t) => {
  const server = new WebSocketServer({ port: 0 })
  let connected = false
  server.once('connection', () => {
    connected = true
  })
  await once(server, 'listening')

  t.after(() => server.close())

  const url = `ws://127.0.0.1:${server.address().port}`
  const undici = join(__dirname, '../..')
  const child = spawn(process.execPath, ['-e', `
    const { WebSocket } = require(${JSON.stringify(undici)})
    const { throws } = require('node:assert');
    const ws = new WebSocket(${JSON.stringify(url)})

    const kRef = Symbol.for('nodejs.ref')
    const kUnref = Symbol.for('nodejs.unref')

    const refFn = ws[kRef]
    const unrefFn = ws[kUnref]

    if (typeof refFn !== 'function' ||
        typeof unrefFn !== 'function') {
      throw new Error('WebSocket does not implement the Refable protocol')
    }
    throws(() => refFn(), { message: 'Illegal invocation' })
    throws(() => unrefFn(), { message: 'Illegal invocation' })

    ws.addEventListener('open', () => {
      process.unref(ws)
      process.ref(ws)
      process.unref(ws)
    })
  `], { stdio: 'ignore' })

  t.after(() => child.kill())

  const { code, signal } = await waitForExit(child, 5000)

  t.assert.strictEqual(connected, true)
  t.assert.strictEqual(code, 0)
  t.assert.strictEqual(signal, null)
})
