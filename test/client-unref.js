'use strict'

const { Worker, isMainThread, workerData } = require('node:worker_threads')

if (isMainThread) {
  const tap = require('tap')
  const { createServer } = require('node:http')

  tap.test('client automatically closes itself when idle', t => {
    t.plan(1)

    const server = createServer((req, res) => {
      res.end()
    })
    t.teardown(server.close.bind(server))
    server.keepAliveTimeout = 9999

    server.listen(0, () => {
      const url = `http://localhost:${server.address().port}`
      const worker = new Worker(__filename, { workerData: { url } })
      worker.on('exit', code => {
        t.equal(code, 0)
      })
    })
  })

  tap.test('client automatically closes itself if the server is not there', t => {
    t.plan(1)

    const url = 'http://localhost:4242' // hopefully empty port
    const worker = new Worker(__filename, { workerData: { url } })
    worker.on('exit', code => {
      t.equal(code, 0)
    })
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
