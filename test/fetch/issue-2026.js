'use strict'

const { cpus } = require('os')
const { isMainThread, Worker, parentPort } = require('worker_threads')
const { test } = require('tap')
const { fetch } = require('../..')

const THREADS = cpus().length - 1
const ROUNDS = 50
const PARALLEL_REQUESTS = 6

if (isMainThread) {
  test('https://github.com/nodejs/undici/issues/2026', async (t) => {
    let stuckWorkers = 0
    const timeout = setTimeout(() => {
      if (stuckWorkers > 0) {
        t.fail(
          `Not finished in 40s. ${stuckWorkers} workers finished fetch() calls but cannot exit.`
        )
      }
    }, 40_000)

    async function task (workerId) {
      const worker = new Worker(__filename)

      await new Promise((resolve) =>
        worker.on(
          'message',
          (message) => message === 'FETCH_FINISHED' && resolve()
        )
      )

      const timer = setTimeout(() => {
        stuckWorkers++
        console.error(`Unable to terminate worker #${workerId}`)
      }, 10_000)
      await worker.terminate()
      clearTimeout(timer)
    }

    const pool = Array(ROUNDS).fill(task)

    async function execute () {
      const task = pool.shift()

      if (task) {
        await task(ROUNDS - pool.length)
        return execute()
      }
    }

    await Promise.all(
      Array(THREADS)
        .fill(execute)
        .map((task) => task())
    )

    clearTimeout(timeout)
  })
} else {
  const urls = [
    new URL('/v4/starlink', 'https://api.spacexdata.com'),
    new URL(
      '/v4/starlink/5eed770f096e59000698560d',
      'https://api.spacexdata.com'
    )
  ]

  const count = Math.round(PARALLEL_REQUESTS / urls.length)
  const requests = Array(count)
    .fill(urls.map((url) => fetch(url).then((r) => r.json())))
    .flat()

  Promise.all(requests).then(() => parentPort.postMessage('FETCH_FINISHED'))
}
