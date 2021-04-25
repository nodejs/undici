'use strict'

const { Worker, isMainThread, workerData } = require('worker_threads')

if (isMainThread) {
  const tap = require('tap')
  const { createServer } = require('http')

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
        console.error(code)
        t.equal(code, 0)
      })
    })
  })
} else {
  const { Client } = require('..')

  const client = new Client(workerData.url)
  client.request({ path: '/', method: 'GET' }, (err, res) => {
    if (err) {
      throw err
    }

    setTimeout(() => {
      throw new Error()
    }, 1e3).unref()
  })
}
