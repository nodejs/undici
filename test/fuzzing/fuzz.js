'use strict'

const net = require('net')

const serverFuzzFnMap = require('./server')
const clientFuzzFnMap = require('./client')

const netServer = net.createServer((socket) => {
  socket.on('data', (data) => {
    // Select server fuzz fn
    // TODO: make this deterministic based on the input data so we can replay data
    const serverFuzzFns = Object.values(serverFuzzFnMap)
    const serverFuzzFn = serverFuzzFns[Math.floor(Math.random() * serverFuzzFns.length)]

    serverFuzzFn(socket, data)
  })
})

const waitForNetServer = netServer.listen(0)

// Set script to exit gracefully after a set period of time.
// Currently: 5 minutes
// TODO: make this configurable
const timer = setTimeout(() => {
  process.kill(process.pid, 'SIGINT')
}, 300_000) // 5 minutes

async function fuzz (buf) {
  // Wait for net server to be ready
  await waitForNetServer

  // Select client fuzz fn based on the buf input
  // TODO: should we be running all these functions for a fuzz value
  await Promise.all(
    Object.entries(clientFuzzFnMap).map(async ([clientFuzzFnName, clientFuzzFn]) => {
      const results = {}
      try {
        await clientFuzzFn(netServer, results, buf)
      } catch (error) {
        clearTimeout(timer)
        console.log(`=== Failed fuzz ${clientFuzzFnName} with input '${buf} ==='`)
        console.log('=== Raw: ', buf, ' ===')
        console.log(`=== Fuzz results start ===\n${JSON.stringify({ clientFuzzFnName, ...results }, null, 2)}\n=== Fuzz results end ===`)
        console.log('=== Fuzz raw results start ===\n', { clientFuzzFnName, ...results }, '\n=== Fuzz raw results end ===')
        throw error
      }
    })
  )
}

module.exports = {
  fuzz
}
