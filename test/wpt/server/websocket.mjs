import { WebSocketServer } from 'ws'
import { server } from './server.mjs'

// When sending a buffer to ws' send method, it auto
// sets the type to binary. This breaks some tests.
const textData = [
  '¥¥¥¥¥¥',
  'Message to send',
  '𐐇',
  '\ufffd',
  '',
  'null'
]

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
    const binary = !textData.includes(data.toString('utf-8'))
    ws.send(data, { binary })
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
