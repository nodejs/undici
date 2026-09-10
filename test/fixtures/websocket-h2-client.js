'use strict'

// Client for test/websocket/h2-keep-process-alive.js. Nothing else here may keep
// the event loop alive: the test checks that the WebSocket alone does.
const { Agent, WebSocket } = require('../..')

const dispatcher = new Agent({
  allowH2: true,
  connect: { rejectUnauthorized: false }
})

const ws = new WebSocket(`wss://localhost:${process.argv[2]}`, { dispatcher })

ws.onopen = () => process.send('open')
ws.onmessage = ({ data }) => process.send(data)
ws.onclose = ({ code, wasClean }) => process.send({ code, wasClean })
ws.onerror = ({ error }) => { throw error }
