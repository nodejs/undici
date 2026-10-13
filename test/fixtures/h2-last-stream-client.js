'use strict'

// Child of the last-stream-close test in http2-max-concurrent-streams-zero-unref.js.
// Do not add anything else here that keeps the event loop alive.
const { once } = require('node:events')
const { Client } = require('../..')

const client = new Client(`https://localhost:${process.argv[2]}`, {
  allowH2: true,
  connect: { rejectUnauthorized: false },
  headersTimeout: 500
})

let outstanding = false

process.on('beforeExit', () => {
  if (outstanding) {
    outstanding = false
    process.send('exited with the request outstanding')
  }
})

async function main () {
  const warm = await client.request({ path: '/', method: 'GET' })
  const bodyDone = warm.body.dump()
  process.send('warmed')

  await once(process, 'message')

  outstanding = true
  const queued = client.request({ path: '/queued', method: 'GET' })
  process.send('queued')

  await bodyDone

  const outcome = await queued.then(
    async ({ body }) => { await body.dump(); return 'settled' },
    (err) => err.code ?? err.message
  )
  outstanding = false
  process.send(outcome)

  await client.close()
}

main().catch((err) => {
  process.exitCode = 1
  process.send(`failed: ${err.code ?? err.message}`)
})
