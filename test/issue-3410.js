'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { fork } = require('node:child_process')
const { resolve: pathResolve } = require('node:path')
const { describe, test } = require('node:test')
const { Agent, fetch, setGlobalDispatcher } = require('..')
const { eventLoopBlocker } = require('./utils/event-loop-blocker')
const { setTimeout, kFastTimer, clearTimeout } = require('../lib/util/timers')

const RESOLUTION_MS = 1000

describe('https://github.com/nodejs/undici/issues/3410', () => {
  test('ensure RESOLUTION_MS is set correctly', async (t) => {
    t = tspl(t, { plan: 2 })

    const nativeTimer = setTimeout(() => {}, RESOLUTION_MS)
    t.equal(nativeTimer[kFastTimer], undefined)
    clearTimeout(nativeTimer)

    const fastTimer = setTimeout(() => {}, RESOLUTION_MS + 1)
    t.equal(fastTimer[kFastTimer], true)
    clearTimeout(fastTimer)
  })

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

    const connectTimeout = 1001
    setGlobalDispatcher(new Agent({ connectTimeout }))

    // With a delay of 95ms between each chunk and a total of 11 chunks
    // the total time to receive the full response should be around 1045ms
    // which is above the connectTimeout of 1001ms.
    const fetchPromise = fetch(address + '?delay=95')

    process.nextTick(() => {
      eventLoopBlocker(1100)
    })

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
      childProcess.unref()
    })

    const connectTimeout = 100
    setGlobalDispatcher(new Agent({ connectTimeout }))

    // With a delay of 10ms between each chunk and a total of 11 chunks
    // the total time to receive the full response should be around 110ms
    // which is above the connectTimeout of 100ms.
    const fetchPromise = fetch(address + '?delay=10')

    process.nextTick(() => {
      eventLoopBlocker(200)
    })
    const response = await fetchPromise

    t.equal(await response.text(), 'Hello World')

    serverProcess.kill('SIGKILL')
  })
})
