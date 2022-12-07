import { WebSocketServer } from 'ws'
import { server } from './server.mjs'

// The file router server handles sending the url, closing,
// and sending messages back to the main process for us.
// The types for WebSocketServer don't include a `request`
// event, so I'm unsure if we can stop relying on server.

const wss = new WebSocketServer({
  server,
  handleProtocols: (protocols) => [...protocols].join(', ')
})

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    ws.send(data)
  })

  // Some tests, such as `Create-blocked-port.any.js` do NOT
  // close the connection automatically.
  const timeout = setTimeout(() => {
    if (ws.readyState !== ws.CLOSED && ws.readyState !== ws.CLOSING) {
      ws.close()
    }
  }, 2500)

  ws.on('close', () => {
    clearTimeout(timeout)
  })
})
