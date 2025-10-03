'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const assert = require('node:assert')
const { createServer } = require('node:http')
const { createSecureServer } = require('node:http2')

const { tspl } = require('@matteo.collina/tspl')
const { WebSocketServer, WebSocket: WSWebsocket } = require('ws')
const { key, cert } = require('@metcoder95/https-pem')
const { WebSocket, Agent } = require('../..')
const { runtimeFeatures } = require('../../lib/util/runtime-features')
const { uid } = require('../../lib/web/websocket/constants')

const crypto = runtimeFeatures.has('crypto')
  ? require('node:crypto')
  : null

function getH2WebSocketServer (server) {
  const wsServer = new WebSocketServer({ noServer: true })
  server.on('stream', (stream, headers) => {
    if (headers[':protocol'] === 'websocket' &&
      headers[':method'] === 'CONNECT') {
      stream.respond({
        ':status': 200,
        'sec-websocket-protocol': headers['sec-websocket-protocol'],
        'sec-websocket-accept': crypto.hash('sha1', `${headers['sec-websocket-key']}${uid}`, 'base64')
      })
      const ws = new WSWebsocket(null, null, { autoPong: true })
      ws.setSocket(stream, Buffer.alloc(0), {
        maxPayload: 104857600,
        skipUTF8Validation: false
      })

      wsServer.emit('connection', ws, stream)
    }
  })

  return wsServer
}

test('WebSocket connecting to server that isn\'t a Websocket server', () => {
  return new Promise((resolve, reject) => {
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      assert.equal(req.headers.connection, 'upgrade')
      assert.equal(req.headers.upgrade, 'websocket')
      assert.ok(req.headers['sec-websocket-key'])
      assert.equal(req.headers['sec-websocket-version'], '13')

      res.end()
      server.unref()
    }).listen(0, () => {
      const ws = new WebSocket(`ws://localhost:${server.address().port}`)

      // Server isn't a websocket server
      ws.onmessage = ws.onopen = reject

      ws.addEventListener('error', ({ error }) => {
        assert.ok(error)
        server.close()
        resolve()
      })
    })
  })
})

test('Open event is emitted', () => {
  return new Promise((resolve, reject) => {
    const server = new WebSocketServer({ port: 0 })

    server.on('connection', (ws) => {
      ws.close(1000)
    })

    const ws = new WebSocket(`ws://localhost:${server.address().port}`)

    ws.onmessage = ws.onerror = reject
    ws.addEventListener('open', () => {
      server.close()
      resolve()
    })
  })
})

test('WebSocket on H2', { skip: crypto == null }, async (t) => {
  const planner = tspl(t, { plan: 2 })
  const server = createSecureServer({ cert, key, allowHTTP1: true, settings: { enableConnectProtocol: true } })
  const wsServer = getH2WebSocketServer(server)

  wsServer.on('connection', (ws) => {
    ws.send('hello')
  })

  server.listen(0)
  await once(server, 'listening')

  const dispatcher = new Agent({
    allowH2: true,
    connect: {
      rejectUnauthorized: false
    }
  })
  const ws = new WebSocket(`wss://localhost:${server.address().port}`, { dispatcher, protocols: ['chat'] })

  t.after(() => {
    // Cleanup - Seems that due to the nature of H2 we need to remove the error listener
    // TODO: investigate if this is a bug
    ws.onerror = null
    return new Promise((resolve) => {
      ws.close()
      server.close()
      wsServer.close(() => {
        dispatcher.close().then(resolve)
      })
    })
  })

  // ws.onclose = (code, reason) => console.log('CLOSE', code, reason)
  ws.onmessage = (evt) => planner.equal(evt.data, 'hello')
  ws.onerror = (err) => planner.fail(err)
  ws.addEventListener('open', () => planner.ok(true))

  await planner.completed
})

test('WebSocket connecting to server that isn\'t a Websocket server (h2 - supports extended CONNECT protocol)', async (t) => {
  const planner = tspl(t, { plan: 6 })
  const h2Server = createSecureServer({ cert, key, settings: { enableConnectProtocol: true } })
    .on('stream', (stream, headers) => {
      planner.equal(headers[':method'], 'CONNECT')
      planner.equal(headers[':protocol'], 'websocket')
      planner.ok(headers['sec-websocket-key'])
      planner.equal(headers['sec-websocket-protocol'], 'chat')
      planner.equal(headers['sec-websocket-version'], '13')

      stream.respond({ ':status': 200 })
      stream.close(8) // NGHTTP2_CANCEL
    })
    .listen(0)

  await once(h2Server, 'listening')

  const dispatcher = new Agent({
    allowH2: true,
    connect: {
      rejectUnauthorized: false
    }
  })
  const ws = new WebSocket(`wss://localhost:${h2Server.address().port}`, { dispatcher, protocols: ['chat'] })
  const cleaner = setupListener()
  ws.onmessage = ws.onopen = () => planner.fail('should not open')

  t.after(() => {
    cleaner()
    dispatcher.close()
    ws.close()
    h2Server.close()
  })

  await planner.completed

  function setupListener () {
    ws.addEventListener('error', listener)

    return () => { ws.removeEventListener('error', listener) }

    function listener ({ error }) {
      planner.ok(error)
    }
  }
})

test('WebSocket on H2 with a server that does not support extended CONNECT protocol', async (t) => {
  const planner = tspl(t, { plan: 1 })
  const h2Server = createSecureServer({ cert, key, settings: { enableConnectProtocol: false } })
    .on('stream', (stream) => {
      stream.respond({ ':status': 200 })
      stream.end('')
      h2Server.unref()
    })
    .listen(0)

  await once(h2Server, 'listening')
  t.after(() => { h2Server.close() })

  const dispatcher = new Agent({
    allowH2: true,
    connect: {
      rejectUnauthorized: false
    }
  })
  const ws = new WebSocket(`wss://localhost:${h2Server.address().port}`, { dispatcher, protocols: ['chat'] })

  t.after(() => { return ws.close() || dispatcher.close() })

  ws.onmessage = ws.onopen = () => planner.fail('should not open')
  ws.addEventListener('error', ({ error }) => {
    planner.ok(error)
    ws.close()
    h2Server.close()
  })

  await planner.completed
})

test('Multiple protocols are joined by a comma', () => {
  return new Promise((resolve, reject) => {
    const server = new WebSocketServer({ port: 0 })

    server.on('connection', (ws, req) => {
      assert.equal(req.headers['sec-websocket-protocol'], 'chat, echo')

      ws.close(1000)
      server.close()
      resolve()
    })

    const ws = new WebSocket(`ws://localhost:${server.address().port}`, ['chat', 'echo'])
    ws.addEventListener('open', () => ws.close())
  })
})

test('Server doesn\'t send Sec-WebSocket-Protocol header when protocols are used', () => {
  return new Promise((resolve, reject) => {
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.statusCode = 101

      req.socket.destroy()
    }).listen(0, () => {
      const ws = new WebSocket(`ws://localhost:${server.address().port}`, 'chat')

      ws.onopen = reject

      ws.addEventListener('error', ({ error }) => {
        assert.ok(error)
        server.close()
        resolve()
      })
    })
  })
})

test('Server sends invalid Upgrade header', () => {
  return new Promise((resolve, reject) => {
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.setHeader('Upgrade', 'NotWebSocket')
      res.statusCode = 101

      req.socket.destroy()
    }).listen(0, () => {
      const ws = new WebSocket(`ws://localhost:${server.address().port}`)

      ws.onopen = reject

      ws.addEventListener('error', ({ error }) => {
        assert.ok(error)
        server.close()
        resolve()
      })
    })
  })
})

test('Server sends invalid Connection header', () => {
  return new Promise((resolve, reject) => {
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.setHeader('Upgrade', 'websocket')
      res.setHeader('Connection', 'downgrade')
      res.statusCode = 101

      req.socket.destroy()
    }).listen(0, () => {
      const ws = new WebSocket(`ws://localhost:${server.address().port}`)

      ws.onopen = reject

      ws.addEventListener('error', ({ error }) => {
        assert.ok(error)
        server.close()
        resolve()
      })
    })
  })
})

test('Server sends invalid Sec-WebSocket-Accept header', () => {
  return new Promise((resolve, reject) => {
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.setHeader('Upgrade', 'websocket')
      res.setHeader('Connection', 'upgrade')
      res.setHeader('Sec-WebSocket-Accept', 'abc')
      res.statusCode = 101

      req.socket.destroy()
    }).listen(0, () => {
      const ws = new WebSocket(`ws://localhost:${server.address().port}`)

      ws.onopen = reject

      ws.addEventListener('error', ({ error }) => {
        assert.ok(error)
        server.close()
        resolve()
      })
    })
  })
})

test('Server sends invalid Sec-WebSocket-Extensions header', { skip: runtimeFeatures.has('crypto') === false }, () => {
  return new Promise((resolve, reject) => {
    const uid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      const key = req.headers['sec-websocket-key']
      assert.ok(key)

      const accept = require('node:crypto').hash('sha1', key + uid, 'base64')

      res.setHeader('Upgrade', 'websocket')
      res.setHeader('Connection', 'upgrade')
      res.setHeader('Sec-WebSocket-Accept', accept)
      res.setHeader('Sec-WebSocket-Extensions', 'InvalidExtension')
      res.statusCode = 101

      res.end()
    }).listen(0, () => {
      const ws = new WebSocket(`ws://localhost:${server.address().port}`)

      ws.onopen = reject

      ws.addEventListener('error', ({ error }) => {
        assert.ok(error)
        server.close()
        resolve()
      })
    })
  })
})

test('Server sends invalid Sec-WebSocket-Extensions header', { skip: runtimeFeatures.has('crypto') === false }, () => {
  const uid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

  return new Promise((resolve, reject) => {
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      const key = req.headers['sec-websocket-key']
      assert.ok(key)

      const accept = require('node:crypto').hash('sha1', key + uid, 'base64')

      res.setHeader('Upgrade', 'websocket')
      res.setHeader('Connection', 'upgrade')
      res.setHeader('Sec-WebSocket-Accept', accept)
      res.setHeader('Sec-WebSocket-Protocol', 'echo') // <--
      res.statusCode = 101

      res.end()
    }).listen(0, () => {
      const ws = new WebSocket(`ws://localhost:${server.address().port}`, 'chat')

      ws.onopen = reject

      ws.addEventListener('error', ({ error }) => {
        assert.ok(error)
        server.close()
        resolve()
      })
    })
  })
})
