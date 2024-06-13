'use strict'

const { Worker, isMainThread, workerData } = require('node:worker_threads')

if (isMainThread) {
  const { tspl } = require('@matteo.collina/tspl')
  const { test, after } = require('node:test')
  const { once } = require('node:events')
  const { createServer } = require('node:http')

  test('client automatically closes itself when idle', async t => {
    t = tspl(t, { plan: 1 })

    const server = createServer((req, res) => {
      res.end()
    })
    after(server.close.bind(server))
    server.keepAliveTimeout = 9999

    server.listen(0)

    await once(server, 'listening')
    const url = `http://localhost:${server.address().port}`
    const worker = new Worker(__filename, { workerData: { url } })
    worker.on('exit', code => {
      t.strictEqual(code, 0)
    })
    await t.completed
  })

  test('client automatically closes itself if the server is not there', async t => {
    t = tspl(t, { plan: 1 })

    const url = 'http://localhost:4242' // hopefully empty port
    const worker = new Worker(__filename, { workerData: { url } })
    worker.on('exit', code => {
      t.strictEqual(code, 0)
    })

    await t.completed
  })
} else {
  const { Client } = require('..')

  const client = new Client(workerData.url)
  client.request({ path: '/', method: 'GET' }, () => {
    // We do not care about Errors

    setTimeout(() => {
      throw new Error()
    }, 1e3).unref()
  })
}
