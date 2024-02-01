'use strict'

const net = require('node:net')
const fs = require('fs/promises')
const path = require('node:path')
const serverFuzzFnMap = require('./server')
const clientFuzzFnMap = require('./client')

const port = process.env.PORT || 0
const timeout = parseInt(process.env.TIMEOUT, 10) || 300_000 // 5 minutes by default

const netServer = net.createServer((socket) => {
  socket.on('data', (data) => {
    // Select server fuzz fn
    const serverFuzzFns = Object.values(serverFuzzFnMap)
    const serverFuzzFn = serverFuzzFns[Math.floor(Math.random() * serverFuzzFns.length)]

    serverFuzzFn(socket, data)
  })
})
const waitForNetServer = netServer.listen(port)

// Set script to exit gracefully after a set period of time.
const timer = setTimeout(() => {
  process.kill(process.pid, 'SIGINT')
}, timeout)

async function writeResults (resultsPath, data) {
  try {
    await fs.writeFile(resultsPath, JSON.stringify(data, null, 2))
    console.log(`=== Written results to ${resultsPath} ===`)
  } catch (err) {
    console.log(`=== Unable to write results to ${resultsPath}`, err, '===')
  }
}

async function fuzz (buf) {
  // Wait for net server to be ready
  await waitForNetServer

  // Select client fuzz fn based on the buf input
  await Promise.all(
    Object.entries(clientFuzzFnMap).map(async ([clientFuzzFnName, clientFuzzFn]) => {
      const results = {}
      try {
        await clientFuzzFn(netServer, results, buf)
      } catch (err) {
        clearTimeout(timer)
        const output = { clientFuzzFnName, buf: { raw: buf, string: buf.toString() }, raw: JSON.stringify({ clientFuzzFnName, buf: { raw: buf, string: buf.toString() }, err, ...results }), err, ...results }

        console.log(`=== Failed fuzz ${clientFuzzFnName} with input '${buf}' ===`)
        console.log('=== Fuzz results start ===')
        console.log(output)
        console.log('=== Fuzz results end ===')

        await writeResults(path.resolve(`fuzz-results-${Date.now()}.json`), output)

        throw err
      }
    })
  )
}

module.exports = {
  fuzz
}
