'use strict'

// Child process for test/http2-max-concurrent-streams-zero-unref.js.
//
// Nothing in this process holds the event loop open except the outstanding
// request, so if the client unrefs its connection while that request is still
// queued, the process exits with status 0 and the await never returns.
const { Client } = require('../..')

async function main () {
  const client = new Client(`https://localhost:${process.argv[2]}`, {
    connect: { rejectUnauthorized: false },
    allowH2: true,
    headersTimeout: 30000,
    bodyTimeout: 30000
  })

  const warm = await client.request({ path: '/', method: 'GET' })
  await warm.body.dump()
  // Let the peer's drain SETTINGS land before asking for another stream.
  await new Promise(resolve => setTimeout(resolve, 300))
  process.send('warmed')

  // The peer now advertises maxConcurrentStreams: 0, so this cannot start.
  await client.request({ path: '/queued', method: 'GET' })

  console.log('UNREACHABLE')
}

main().then(
  () => { process.exitCode = 4 },
  () => { process.exitCode = 5 } // settling with an error is fine; a silent exit 0 is not
)
