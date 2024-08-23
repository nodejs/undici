'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { fork } = require('node:child_process')
const { resolve: pathResolve } = require('node:path')
const { test } = require('node:test')
const { Agent, fetch, setGlobalDispatcher } = require('..')
const { eventLoopBlocker } = require('./utils/event-loop-blocker')

test('https://github.com/nodejs/undici/issues/3356', async (t) => {
  t = tspl(t, { plan: 1 })

  // Spawn a server in a new process to avoid effects from the blocking event loop
  const {
    serverProcess,
    address
  } = await new Promise((resolve, reject) => {
    const childProcess = fork(
      pathResolve(__dirname, './utils/hello-world-server.js'),
      [],
      { windowsHide: true }
    )

    childProcess.on('message', (address) => {
      resolve({
        serverProcess: childProcess,
        address
      })
    })
    childProcess.on('error', err => {
      reject(err)
    })
  })

  const connectTimeout = 2000
  setGlobalDispatcher(new Agent({ connectTimeout }))

  const fetchPromise = fetch(address)

  eventLoopBlocker(3000)

  const response = await fetchPromise

  t.equal(await response.text(), 'Hello World')

  serverProcess.kill('SIGKILL')
})
