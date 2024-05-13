'use strict'

const { WebSocket } = require('../..')

let currentTest = 1
let testCount

const autobahnFuzzingserverUrl = process.env.FUZZING_SERVER_URL || 'ws://localhost:9001'

function nextTest () {
  let ws

  if (currentTest > testCount) {
    ws = new WebSocket(`${autobahnFuzzingserverUrl}/updateReports?agent=undici`)
    return
  }

  console.log(`Running test case ${currentTest}/${testCount}`)

  ws = new WebSocket(
    `${autobahnFuzzingserverUrl}/runCase?case=${currentTest}&agent=undici`
  )
  ws.addEventListener('message', (data) => {
    ws.send(data.data)
  })
  ws.addEventListener('close', () => {
    currentTest++
    process.nextTick(nextTest)
  })
  ws.addEventListener('error', (e) => {
    console.error(e.error)
  })
}

const ws = new WebSocket(`${autobahnFuzzingserverUrl}/getCaseCount`)
ws.addEventListener('message', (data) => {
  testCount = parseInt(data.data)
})
ws.addEventListener('close', () => {
  if (testCount > 0) {
    nextTest()
  }
})
ws.addEventListener('error', (e) => {
  console.error(e.error)
  process.exit(1)
})
