'use strict'

// WebSocket and WebSocketStream read their receive limits (maxPayloadSize,
// maxFragments) from the dispatcher's `webSocketOptions`. Wrappers such as
// RetryAgent and MockAgent must report the wrapped agent's limits, and a
// dispatcher that doesn't provide any must get the default limits, not none.
//
// Each test waits for the close code the server observes, so nothing depends
// on timing. If a message gets through instead, the client closes normally
// and the test fails on the close code rather than hanging.

const { test } = require('node:test')
const { once } = require('node:events')
const { createDeflateRaw, constants } = require('node:zlib')
const { WebSocketServer } = require('ws')
const {
  Agent,
  Dispatcher1Wrapper,
  MockAgent,
  RetryAgent,
  WebSocket,
  WebSocketStream,
  getGlobalDispatcher,
  setGlobalDispatcher
} = require('../..')

const webSocket = { maxPayloadSize: 1024, maxFragments: 8 }

const wrappers = {
  RetryAgent: (opts) => new RetryAgent(new Agent(opts)),
  MockAgent: (opts) => {
    const agent = new MockAgent(opts)
    agent.enableNetConnect()
    return agent
  },
  Dispatcher1Wrapper: (opts) => new Dispatcher1Wrapper(new Agent(opts))
}

// A dispatcher that only implements `dispatch`, so it has no webSocketOptions.
function customDispatcher (t) {
  const agent = new Agent()
  t.after(() => agent.close())
  return { dispatch: (opts, handler) => agent.dispatch(opts, handler) }
}

// Starts a server that runs `send(ws)` for each connection and resolves
// `closed` with the close code and reason it receives.
async function startServer (t, send) {
  const server = new WebSocketServer({ port: 0, perMessageDeflate: true })
  t.after(() => server.close())
  await once(server, 'listening')

  const closed = new Promise((resolve) => {
    server.on('connection', (ws) => {
      ws.on('close', (code, reason) => resolve({ code, reason: reason.toString() }))
      send(ws)
    })
  })

  return { url: `ws://127.0.0.1:${server.address().port}`, closed }
}

// Resolves with the size of the first message, closing the connection.
function connect (t, url, dispatcher) {
  const ws = new WebSocket(url, { dispatcher })
  t.after(() => ws.close())
  return new Promise((resolve) => {
    ws.onmessage = (event) => {
      resolve(event.data.size)
      ws.close()
    }
  })
}

function sendCompressed (size) {
  return (ws) => ws.send(Buffer.alloc(size, 0x41), { binary: true, compress: true })
}

function sendFragments (count) {
  return (ws) => {
    const fragment = Buffer.from('a')
    for (let i = 0; i < count; i++) {
      ws.send(fragment, { binary: true, compress: false, fin: i === count - 1 })
    }
  }
}

// One compressed frame that inflates to just over the 128 MB default, while
// only about 128 KB goes over the wire (a decompression bomb).
function sendDecompressionBomb (ws) {
  const deflate = createDeflateRaw()
  const chunks = []
  deflate.on('data', (chunk) => chunks.push(chunk))
  const megabyte = Buffer.alloc(1024 * 1024)
  for (let i = 0; i < 129; i++) {
    deflate.write(megabyte)
  }
  deflate.flush(constants.Z_SYNC_FLUSH, () => {
    // permessage-deflate drops the trailing 00 00 ff ff of the sync flush.
    const stream = Buffer.concat(chunks)
    const payload = stream.subarray(0, stream.length - 4)

    // Server -> client binary frame, FIN=1, RSV1=1 (compressed), 64-bit length
    const header = Buffer.alloc(10)
    header[0] = 0xC2
    header[1] = 0x7f
    header.writeUInt32BE(0, 2)
    header.writeUInt32BE(payload.length, 6)
    ws._socket.write(Buffer.concat([header, payload]))
  })
}

for (const [name, wrap] of Object.entries(wrappers)) {
  test(`${name} applies the wrapped agent's maxPayloadSize`, async (t) => {
    const dispatcher = wrap({ webSocket })
    t.after(() => dispatcher.close())
    const server = await startServer(t, sendCompressed(64 * 1024))

    connect(t, server.url, dispatcher)
    const { code } = await server.closed
    t.assert.strictEqual(code, 1009)
  })

  test(`${name} applies the wrapped agent's maxFragments`, async (t) => {
    const dispatcher = wrap({ webSocket })
    t.after(() => dispatcher.close())
    const server = await startServer(t, sendFragments(20))

    connect(t, server.url, dispatcher)
    t.assert.deepStrictEqual(await server.closed, { code: 1008, reason: 'Too many message fragments' })
  })

  test(`${name} delivers messages within the wrapped agent's limits`, async (t) => {
    const dispatcher = wrap({ webSocket })
    t.after(() => dispatcher.close())
    const server = await startServer(t, sendFragments(8))

    t.assert.strictEqual(await connect(t, server.url, dispatcher), 8)
    t.assert.strictEqual((await server.closed).code, 1005)
  })
}

test('a dispatcher without webSocketOptions gets the default maxFragments', async (t) => {
  // One more than the default of 131072.
  const server = await startServer(t, sendFragments(131073))

  connect(t, server.url, customDispatcher(t))
  t.assert.deepStrictEqual(await server.closed, { code: 1008, reason: 'Too many message fragments' })
})

test('a dispatcher without webSocketOptions gets the default maxPayloadSize for decompression', async (t) => {
  const server = await startServer(t, sendDecompressionBomb)

  connect(t, server.url, customDispatcher(t))
  const { code } = await server.closed
  t.assert.strictEqual(code, 1009)
})

test('an explicit 0 still disables the limits through a wrapper', async (t) => {
  const dispatcher = new RetryAgent(new Agent({ webSocket: { maxPayloadSize: 0, maxFragments: 0 } }))
  t.after(() => dispatcher.close())
  // More fragments than the default limit, so a 0 replaced by the default
  // would fail this.
  const server = await startServer(t, sendFragments(131073))

  t.assert.strictEqual(await connect(t, server.url, dispatcher), 131073)
  t.assert.strictEqual((await server.closed).code, 1005)
})

test('WebSocketStream applies the limits of a wrapped global dispatcher', async (t) => {
  // WebSocketStream doesn't take a dispatcher option; it uses the global one.
  const previous = getGlobalDispatcher()
  const dispatcher = new RetryAgent(new Agent({ webSocket }))
  setGlobalDispatcher(dispatcher)
  t.after(async () => {
    setGlobalDispatcher(previous)
    await dispatcher.close()
  })

  const server = await startServer(t, sendFragments(20))
  const wss = new WebSocketStream(server.url)
  // Observe both promises right away: `closed` rejects when the connection
  // fails, and an unobserved rejection would fail the test process.
  const settled = Promise.allSettled([wss.opened, wss.closed])

  // Read the first message; if it arrives, close so the test fails on the code.
  wss.opened.then(async ({ readable }) => {
    const reader = readable.getReader()
    const { done } = await reader.read()
    if (!done) {
      wss.close()
    }
  }).catch(() => {})

  t.assert.deepStrictEqual(await server.closed, { code: 1008, reason: 'Too many message fragments' })
  await settled
})
