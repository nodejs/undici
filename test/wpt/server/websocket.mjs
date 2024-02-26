import { WebSocketServer } from 'ws'
import { server } from './server.mjs'

// The file router server handles sending the url, closing,
// and sending messages back to the main process for us.
// The types for WebSocketServer don't include a `request`
// event, so I'm unsure if we can stop relying on server.

const wss = new WebSocketServer({
  server,
  handleProtocols: (protocols) => protocols.values().next().value
})

wss.on('connection', (ws, request) => {
  ws.on('message', (data, isBinary) => {
    const str = data.toString('utf-8')

    if (request.url === '/receive-many-with-backpressure') {
      setTimeout(() => {
        ws.send(str.length.toString(), { binary: false })
      }, 100)
      return
    }

    if (str === 'Goodbye') {
      // Close-server-initiated-close.any.js sends a "Goodbye" message
      // when it wants the server to close the connection.
      ws.close(1000)
      return
    }

    ws.send(data, { binary: isBinary })
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
