import { WebSocketServer } from 'ws'
import { server } from './server.mjs'

// The file router server handles sending the url, closing,
// and sending messages back to the main process for us.
// The types for WebSocketServer don't include a `request`
// event, so I'm unsure if we can stop relying on server.

const wss = new WebSocketServer({
  noServer: true,
  handleProtocols: (protocols) => protocols.values().next().value
})

wss.on('connection', (ws, request) => {
  if (request.url === '/protocol_array') {
    const line = request.headers['sec-websocket-protocol']
    const protocol = line.split(',')[0]
    ws.send(protocol)
    return
  } else if (request.url === '/remote-close' || request.url.startsWith('/remote-close?')) {
    const fullUrl = new URL(request.url, `ws://localhost:${server.address().port}`)

    const code = fullUrl.searchParams.has('code') ? Number(fullUrl.searchParams.get('code')) : undefined
    const reason = fullUrl.searchParams.get('reason') ?? undefined
    const abrupt = fullUrl.searchParams.get('abrupt') === '1'

    if (abrupt) {
      ws._socket.end()
      return
    }

    ws.close(code, reason)
    return
  }

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

server.on('upgrade', (request, socket, head) => {
  if (request.url === '/404') {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
    socket.destroy()
    return
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})
