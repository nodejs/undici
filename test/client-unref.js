'use strict'

const tap = require('tap')
const { createServer } = require('http')
const { once } = require('events')
const { Client } = require('../..')
const { Worker, isMainThread, parentPort } = require('worker_threads')

// On the main thread, spawn a worker that immediately launches an http server.
if (isMainThread) {
  tap.test('client automatically closes itself when idle', async t => {
    const worker = new Worker(__filename)
    // fail the test if the worker fails
    worker.on('exit', code => {
      if (code !== 0) {
        t.fail(`Worker stopped with exit code ${code}`)
      }
    })
    // get server url from worker
    const [ { url } ] = await once(worker, 'message')
    // create undici client and dispatch a request
    const client = new Client(url)
    const { body } = await client.request({ path: '/', method: 'GET' })
    body.resume()
    // once the body has been read entirely set a timeout cb that will fail the
    // tap test if it executes. It will execute if the client does not
    // unreference itself as well.
    await once(body, 'end')
    setTimeout(() => {
      t.fail('Client did not automatically unref')
    }, 2e3).unref()
    // clean up the server in the worker thread so the tap test can end
    worker.postMessage('close_server')
    // succesfully end the tests
    t.end()
  })
} else {
  // This is the worker thread code. If the process fails at any point so will
  // the main thread (and the tap test)
  const server = createServer((req, res) => {
    res.end()
  })

  server.listen(0, () => {
    const url = `http://localhost:${server.address().port}`
    parentPort.postMessage({ url })
  })

  parentPort.once('message', message => {
    if (message === 'close_server' && server.listening) {
      server.close()
      process.exit(0)
    }
  })
}
