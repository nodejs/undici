'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { fork } = require('node:child_process')
const { resolve: pathResolve } = require('node:path')
const { describe, test } = require('node:test')
const { Agent, fetch, setGlobalDispatcher } = require('..')
const { eventLoopBlocker } = require('./utils/event-loop-blocker')

describe('https://github.com/nodejs/undici/issues/3410', () => {
  test('FastTimers', async (t) => {
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

  test('native Timers', async (t) => {
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

    const connectTimeout = 900
    setGlobalDispatcher(new Agent({ connectTimeout }))

    const fetchPromise = fetch(address)

    eventLoopBlocker(1500)

    const response = await fetchPromise

    t.equal(await response.text(), 'Hello World')

    serverProcess.kill('SIGKILL')
  })
})
