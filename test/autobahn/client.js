// @ts-check
const { WebSocket } = require('../..')

let currentTest = 1
let testCount

function nextTest () {
  let ws

  if (currentTest > testCount) {
    ws = new WebSocket('ws://localhost:9001/updateReports?agent=ws')
    return
  }

  console.log(`Running test case ${currentTest}/${testCount}`)

  ws = new WebSocket(
    `ws://localhost:9001/runCase?case=${currentTest}&agent=ws`
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

const ws = new WebSocket('ws://localhost:9001/getCaseCount')
ws.addEventListener('message', (data) => {
  testCount = parseInt(data.data)
})
ws.addEventListener('close', () => {
  if (testCount > 0) {
    nextTest()
  }
})
