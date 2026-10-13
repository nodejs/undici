'use strict'

const assert = require('node:assert')
const { test, after } = require('node:test')
const { createServer } = require('node:tls')
const { createSecureServer } = require('node:http2')
const { once } = require('node:events')

const pem = require('@metcoder95/https-pem')

const { Client } = require('..')

// A server that refuses a request with GOAWAY(lastStreamID = 0) is saying "I
// processed nothing, retry elsewhere" (RFC 9113 §6.8) -- what a draining proxy
// or an overloaded load balancer sends.
//
// onHttp2SessionGoAway() requeues the request and reconnects immediately. There
// is no attempt counter, no backoff and no deadline, so while the condition
// persists the client spins connect -> HEADERS -> GOAWAY -> requeue -> connect
// several hundred times per second: the request never settles, a CPU core is
// pinned and the event loop is starved for every other origin in the process.
//
// Node's http2 server clamps lastStreamID to the last stream it actually
// received, so these tests drive the connection at the frame level.

const PREFACE = Buffer.from('PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n')
const FRAME_SETTINGS = 4
const FRAME_PING = 6
const FRAME_HEADERS = 1

function frame (type, flags, streamId, payload = Buffer.alloc(0)) {
  const head = Buffer.alloc(9)
  head.writeUIntBE(payload.length, 0, 3)
  head[3] = type
  head[4] = flags
  head.writeUInt32BE(streamId >>> 0, 5)
  return Buffer.concat([head, payload])
}

function goawayFrame (lastStreamId, errorCode) {
  const payload = Buffer.alloc(8)
  payload.writeUInt32BE(lastStreamId >>> 0, 0)
  payload.writeUInt32BE(errorCode >>> 0, 4)
  return frame(7, 0, 0, payload)
}

// Minimal h2 peer: completes the handshake, then refuses whatever it is asked.
async function refusingServer (errorCode) {
  const { key, cert } = await pem.generate({ opts: { keySize: 2048 } })
  let connections = 0

  const sockets = new Set()
  const server = createServer({ key, cert, ALPNProtocols: ['h2'] }, (socket) => {
    connections++
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    let buf = Buffer.alloc(0)
    let sawPreface = false

    socket.on('error', () => {})
    socket.write(frame(FRAME_SETTINGS, 0, 0))

    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk])

      if (!sawPreface) {
        if (buf.length < PREFACE.length) return
        buf = buf.subarray(PREFACE.length)
        sawPreface = true
      }

      while (buf.length >= 9) {
        const length = buf.readUIntBE(0, 3)
        if (buf.length < 9 + length) break

        const type = buf[3]
        const flags = buf[4]
        const payload = buf.subarray(9, 9 + length)
        buf = buf.subarray(9 + length)

        if (type === FRAME_SETTINGS && !(flags & 0x1)) socket.write(frame(FRAME_SETTINGS, 0x1, 0))
        if (type === FRAME_PING && !(flags & 0x1)) socket.write(frame(FRAME_PING, 0x1, 0, payload))
        if (type === FRAME_HEADERS) socket.write(goawayFrame(0, errorCode))
      }
    })
  })

  await once(server.listen(0), 'listening')
  server.connections = () => connections
  server.shutdown = () => {
    for (const socket of sockets) socket.destroy()
    server.close()
  }
  return server
}

// A wedged/spinning h2 client can leave the event loop without a ref'd handle.
function holdEventLoop () {
  const timer = setInterval(() => {}, 1000)
  return () => clearInterval(timer)
}

async function measure (errorCode, label) {
  const release = holdEventLoop()
  const server = await refusingServer(errorCode)

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: { rejectUnauthorized: false },
    allowH2: true,
    headersTimeout: 1000,
    bodyTimeout: 1000
  })
  after(async () => {
    await client.destroy()
    server.shutdown()
    release()
  })

  const pending = client.request({ path: '/', method: 'GET' }).then(() => {}, () => {})

  let timer
  const outcome = await Promise.race([
    pending.then(() => 'settled'),
    new Promise((resolve) => { timer = setTimeout(() => resolve('stuck'), 3000) })
  ]).finally(() => clearTimeout(timer))

  const connections = server.connections()

  await client.destroy()
  await pending

  assert.strictEqual(outcome, 'settled', `${label}: the request never settled`)
  // RFC 9113 section 8.7 allows one automatic retry, so the first attempt plus
  // one replay. The margin is for a pool that happens to open a spare.
  assert.ok(
    connections <= 4,
    `${label}: retried the refused request over ${connections} connections`
  )
}

test('a repeatedly refused h2 request must not reconnect without bound', async () => {
  await measure(0, 'GOAWAY(NO_ERROR)')
})

test('a GOAWAY carrying an error code must not be retried without bound', async () => {
  // ENHANCE_YOUR_CALM is explicit backpressure; INTERNAL_ERROR is terminal.
  // Neither is a reason to reconnect as fast as the event loop allows.
  await measure(11, 'GOAWAY(ENHANCE_YOUR_CALM)')
  await measure(2, 'GOAWAY(INTERNAL_ERROR)')
})

test('a refused h2 origin must not starve unrelated work in the process', async () => {
  const release = holdEventLoop()

  // A healthy h2 origin to measure against.
  const healthy = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  healthy.on('stream', (stream) => {
    stream.on('error', () => {})
    stream.respond({ ':status': 200 })
    stream.end('ok')
  })
  await once(healthy.listen(0), 'listening')

  const healthyClient = new Client(`https://localhost:${healthy.address().port}`, {
    connect: { rejectUnauthorized: false },
    allowH2: true
  })

  const measureThroughput = async (ms) => {
    let served = 0
    const deadline = Date.now() + ms
    while (Date.now() < deadline) {
      const res = await healthyClient.request({ path: '/', method: 'GET' })
      await res.body.dump()
      served++
    }
    return served
  }

  const baseline = await measureThroughput(1000)

  const refusing = await refusingServer(0)
  const refusingClient = new Client(`https://localhost:${refusing.address().port}`, {
    connect: { rejectUnauthorized: false },
    allowH2: true,
    headersTimeout: 1000,
    bodyTimeout: 1000
  })

  after(async () => {
    await refusingClient.destroy()
    await healthyClient.destroy()
    refusing.shutdown()
    healthy.close()
    release()
  })

  // One request to the refusing origin, then measure the healthy one again.
  const pending = refusingClient.request({ path: '/', method: 'GET' }).then(() => {}, () => {})
  const during = await measureThroughput(1000)

  await refusingClient.destroy()
  await pending

  assert.ok(
    during > baseline / 2,
    `one refused h2 origin cut unrelated throughput from ${baseline}/s to ${during}/s ` +
    `(${refusing.connections()} reconnects in 1s)`
  )
})
