'use strict'

// A Client serves requests for several TLS server names, one at a time. A
// connection attempt verifies the server for one name. If its requests are
// aborted while it connects and the next queued request is for another name,
// that request must not be sent on this connection: the server never proved
// its identity for that name.

const { test } = require('node:test')
const assert = require('node:assert')
const { once } = require('node:events')
const net = require('node:net')
const https = require('node:https')
const http2 = require('node:http2')
const pem = require('@metcoder95/https-pem')
const { Client, Agent, interceptors, buildConnector } = require('..')

// Fails the test instead of hanging it when the promise does not settle.
function settlesWithin (promise, ms = 2000) {
  let timer
  return Promise.race([
    promise,
    new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`still pending after ${ms}ms`)), ms)
    })
  ]).finally(() => clearTimeout(timer))
}

// The certificate is trusted, but valid only for a.test.
function onlyATest (host) {
  if (host !== 'a.test') {
    return Object.assign(new Error(`Hostname/IP does not match certificate's altnames: Host: ${host}`), {
      code: 'ERR_TLS_CERT_ALTNAME_INVALID'
    })
  }
}

// The certificate is trusted for any name.
function anyName () {}

// A TLS server behind a TCP front. The front holds the first connection, so
// its TLS handshake is pending when the request is aborted: it never forwards
// it, or forwards it after `delayFirst` ms. Later connections are forwarded at
// once. The server records the Host and the TLS server name of each request.
async function startServer (t, { h2 = false, delayFirst = null } = {}) {
  const served = []
  const handler = (req, res) => {
    const host = (req.headers[':authority'] ?? req.headers.host).split(':')[0]
    served.push({ host, servername: req.socket.servername })
    res.end(host)
  }
  const server = h2
    ? http2.createSecureServer({ ...pem, allowHTTP1: true }, handler)
    : https.createServer(pem, handler)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')

  const sockets = []
  let first = null
  let timer = null
  const front = net.createServer((socket) => {
    sockets.push(socket)
    const forward = () => {
      if (socket.destroyed) {
        return
      }
      const upstream = net.connect(server.address().port, '127.0.0.1')
      sockets.push(upstream)
      socket.pipe(upstream).pipe(socket)
      socket.on('error', () => upstream.destroy())
      upstream.on('error', () => socket.destroy())
    }

    if (first !== null) {
      forward()
      return
    }

    first = socket
    if (delayFirst !== null) {
      timer = setTimeout(forward, delayFirst)
    } else {
      socket.resume()
    }
  })
  front.listen(0, '127.0.0.1')
  await once(front, 'listening')

  t.after(() => {
    clearTimeout(timer)
    for (const socket of sockets) socket.destroy()
    front.close()
    server.close()
  })

  return { port: front.address().port, served }
}

// Starts a request for a.test, queues one for b.test, then aborts the first
// while its connection attempt is pending.
async function abortFirstWhileConnecting (dispatch) {
  const ac = new AbortController()
  const a = dispatch('a.test', ac.signal)
  const b = dispatch('b.test')
  await new Promise(resolve => setTimeout(resolve, 50))
  ac.abort()
  await assert.rejects(a, { name: 'AbortError' })
  return b
}

function clientDispatch (client) {
  return (host, signal) => client.request({
    path: '/',
    method: 'GET',
    servername: host,
    headers: { host },
    signal
  })
}

for (const h2 of [false, true]) {
  const name = h2 ? 'h2' : 'h1'

  test(`${name}: a request is not sent on a connection verified for another servername`, async (t) => {
    const { port, served } = await startServer(t, { h2, delayFirst: 200 })
    const client = new Client(`https://127.0.0.1:${port}`, {
      allowH2: h2,
      connect: { ca: pem.cert, checkServerIdentity: onlyATest }
    })
    t.after(() => client.destroy())

    const b = abortFirstWhileConnecting(clientDispatch(client))

    await assert.rejects(settlesWithin(b), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' })
    assert.deepStrictEqual(served, [])
  })

  test(`${name}: the next request connects with its own servername without waiting for the abandoned attempt`, async (t) => {
    // The first connection never completes its handshake.
    const { port, served } = await startServer(t, { h2 })
    const client = new Client(`https://127.0.0.1:${port}`, {
      allowH2: h2,
      connect: { ca: pem.cert, checkServerIdentity: anyName }
    })
    t.after(() => client.destroy())

    const b = abortFirstWhileConnecting(clientDispatch(client))

    const res = await settlesWithin(b)
    assert.strictEqual(await res.body.text(), 'b.test')
    assert.deepStrictEqual(served, [{ host: 'b.test', servername: 'b.test' }])
  })
}

test('Agent with the dns interceptor: a request is not sent on a connection verified for another host', async (t) => {
  const { port, served } = await startServer(t, { delayFirst: 200 })
  const agent = new Agent({
    connections: 1,
    connect: { ca: pem.cert, checkServerIdentity: onlyATest }
  }).compose(interceptors.dns({
    lookup: (_origin, _opts, cb) => cb(null, [{ address: '127.0.0.1', family: 4, ttl: 10000 }])
  }))
  t.after(() => agent.destroy())

  const b = abortFirstWhileConnecting((host, signal) => agent.request({
    origin: `https://${host}:${port}`,
    path: '/',
    method: 'GET',
    signal
  }))

  await assert.rejects(settlesWithin(b), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' })
  assert.deepStrictEqual(served, [])
})

test('a connection that cannot be cancelled is discarded once it connects for another servername', async (t) => {
  const { port, served } = await startServer(t, { delayFirst: 200 })
  const connector = buildConnector({ ca: pem.cert, checkServerIdentity: anyName })
  const servernames = []
  const client = new Client(`https://127.0.0.1:${port}`, {
    // Does not return the socket, so the Client cannot cancel the attempt.
    connect (opts, cb) {
      servernames.push(opts.servername)
      connector(opts, cb)
    }
  })
  t.after(() => client.destroy())

  const b = abortFirstWhileConnecting(clientDispatch(client))

  const res = await settlesWithin(b)
  assert.strictEqual(await res.body.text(), 'b.test')
  assert.deepStrictEqual(servernames, ['a.test', 'b.test'])
  assert.deepStrictEqual(served, [{ host: 'b.test', servername: 'b.test' }])
})
