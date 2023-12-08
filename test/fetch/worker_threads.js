const {
  isMainThread,
  parentPort,
  Worker,
  workerData
} = require('node:worker_threads')

if (isMainThread) {
  const { test } = require('tap')
  const { once } = require('node:events')
  const { cpus } = require('node:os')
  const { createServer } = require('node:http')
  const THREADS = cpus().length - 1
  const ROUNDS = 10
  test('terminate the process correctly', async (t) => {
    const server = createServer((req, res) => {
      res.end('Hi')
    })

    t.teardown(server.close.bind(server))
    server.listen(0)
    await once(server, 'listening')

    const serverName = `http://localhost:${server.address().port}`

    async function task () {
      const worker = new Worker(__filename, { workerData: { serverName } })
      await new Promise((resolve) => {
        worker.on('message', (message) => {
          if (message === 'DONE') resolve()
        })
      })

      await worker.terminate()
    }

    const pool = new Array(ROUNDS).fill(task)

    async function execute () {
      const task = pool.shift()

      if (task) {
        await task()
        return execute()
      }
    }
    await Promise.all(new Array(THREADS).fill(execute).map((task) => task()))
    t.end()
  })
} else {
  (async () => {
    const serverName = workerData.serverName
    const { fetch } = require('../..')

    await Promise.all([
      fetch(serverName).then((r) => r.arrayBuffer()),
      fetch(serverName).then((r) => r.arrayBuffer()),
      fetch(serverName).then((r) => r.arrayBuffer()),
      fetch(serverName).then((r) => r.arrayBuffer())
    ])
    parentPort.postMessage('DONE')
  })()
}
