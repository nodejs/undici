'use strict'

const assert = require('node:assert/strict')
const diagnosticsChannel = require('node:diagnostics_channel')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { createSecureServer } = require('node:http2')
const { PassThrough } = require('node:stream')
const { test } = require('node:test')

const pem = require('@metcoder95/https-pem')

const { Agent, Client, connect, getGlobalDispatcher, setGlobalDispatcher } = require('../../..')

const requestChannels = {
  bodySent: diagnosticsChannel.channel('undici:request:bodySent'),
  create: diagnosticsChannel.channel('undici:request:create'),
  error: diagnosticsChannel.channel('undici:request:error'),
  headers: diagnosticsChannel.channel('undici:request:headers'),
  trailers: diagnosticsChannel.channel('undici:request:trailers')
}

function onExpectedTeardownError (error) {
  if (error.code !== 'ECONNRESET') {
    throw error
  }
}

function observeRequestLifecycles (testContext) {
  const records = []
  const recordsByRequest = new Map()
  const subscriptions = {
    bodySent ({ request }) {
      recordsByRequest.get(request).events.push('bodySent')
    },
    create ({ request }) {
      const record = { request, events: ['create'], responses: [], trailers: [] }
      records.push(record)
      recordsByRequest.set(request, record)
    },
    error ({ request }) {
      recordsByRequest.get(request).events.push('error')
    },
    headers ({ request, response }) {
      const record = recordsByRequest.get(request)
      record.events.push('headers')
      record.responses.push(response)
    },
    trailers ({ request, trailers }) {
      const record = recordsByRequest.get(request)
      record.events.push('trailers')
      record.trailers.push(trailers)
    }
  }

  for (const name of Object.keys(subscriptions)) {
    requestChannels[name].subscribe(subscriptions[name])
  }
  testContext.after(() => {
    for (const name of Object.keys(subscriptions)) {
      requestChannels[name].unsubscribe(subscriptions[name])
    }
  })

  return records
}

test('successful upgrades complete the request diagnostics lifecycle', async (testContext) => {
  const server = createServer()
  server.on('upgrade', (_request, socket) => {
    socket.end('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: test\r\n\r\n')
  })
  server.on('connect', (_request, socket) => {
    socket.end('HTTP/1.1 200 Connection Established\r\n\r\n')
  })
  testContext.after(() => server.close())

  server.listen(0)
  await once(server, 'listening')

  const origin = `http://127.0.0.1:${server.address().port}`
  const records = observeRequestLifecycles(testContext)
  const client = new Client(origin)
  testContext.after(() => client.close())

  const body = new PassThrough({ autoDestroy: false })
  const upgrade = client.upgrade({ path: '/', protocol: 'test', body })
  body.end()
  const { socket } = await upgrade
  socket.destroy()

  assert.strictEqual(records.length, 1)
  assert.deepStrictEqual(records[0].events, ['create', 'bodySent', 'headers', 'trailers'])
  assert.strictEqual(records[0].request.completed, true)
  assert.strictEqual(records[0].responses[0].statusCode, 101)
  assert.strictEqual(records[0].responses[0].statusText, 'Switching Protocols')
  assert.deepStrictEqual(records[0].trailers, [[]])
  assert.strictEqual(body.listenerCount('end'), 0)
  assert.strictEqual(body.listenerCount('error'), 0)

  const previousDispatcher = getGlobalDispatcher()
  const agent = new Agent()
  setGlobalDispatcher(agent)
  testContext.after(() => {
    setGlobalDispatcher(previousDispatcher)
    return agent.close()
  })

  const tunnel = await connect(origin)
  tunnel.socket.destroy()

  assert.strictEqual(records.length, 2)
  assert.deepStrictEqual(records[1].events, ['create', 'bodySent', 'headers', 'trailers'])
  assert.strictEqual(records[1].request.completed, true)
  assert.strictEqual(records[1].responses[0].statusCode, 200)
  assert.strictEqual(records[1].responses[0].statusText, 'Connection Established')
  assert.deepStrictEqual(records[1].trailers, [[]])
})

test('a rejected upgrade emits an error without successful completion', async (testContext) => {
  const server = createServer((_request, response) => response.end())
  testContext.after(() => server.close())

  server.listen(0)
  await once(server, 'listening')

  const records = observeRequestLifecycles(testContext)
  const client = new Client(`http://127.0.0.1:${server.address().port}`)
  testContext.after(() => client.close())

  await assert.rejects(client.upgrade({ path: '/', protocol: 'test' }))

  assert.strictEqual(records.length, 1)
  assert.deepStrictEqual(records[0].events, ['create', 'bodySent', 'headers', 'error'])
  assert.strictEqual(records[0].request.completed, false)
})

test('an upgrade handler error aborts the request diagnostics lifecycle', async (testContext) => {
  const server = createServer()
  server.on('upgrade', (_request, socket) => {
    socket.end('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: test\r\n\r\n')
  })
  testContext.after(() => server.close())

  server.listen(0)
  await once(server, 'listening')

  const records = observeRequestLifecycles(testContext)
  const client = new Client(`http://127.0.0.1:${server.address().port}`)
  testContext.after(() => client.close())

  const expectedError = new Error('upgrade handler failed')
  const responseError = new Promise((resolve, reject) => {
    client.dispatch({ method: 'GET', path: '/', upgrade: 'test' }, {
      onRequestStart () {},
      onRequestUpgrade () {
        throw expectedError
      },
      onResponseError (_controller, error) {
        if (error === expectedError) resolve()
        else reject(error)
      }
    })
  })
  await responseError

  assert.strictEqual(records.length, 1)
  assert.deepStrictEqual(records[0].events, ['create', 'bodySent', 'headers', 'error'])
  assert.strictEqual(records[0].request.completed, false)
  assert.strictEqual(records[0].request.aborted, true)
})

test('an aborted upgrade emits an error without successful completion', async (testContext) => {
  let serverSocket
  const server = createServer()
  server.on('upgrade', (_request, socket) => {
    serverSocket = socket
  })
  testContext.after(() => {
    serverSocket?.destroy()
    server.close()
  })

  server.listen(0)
  await once(server, 'listening')

  const records = observeRequestLifecycles(testContext)
  const client = new Client(`http://127.0.0.1:${server.address().port}`)
  testContext.after(() => client.close())

  const abortController = new AbortController()
  const upgrade = client.upgrade({ path: '/', protocol: 'test', signal: abortController.signal })
  await once(server, 'upgrade')
  abortController.abort()
  await assert.rejects(upgrade)

  assert.strictEqual(records.length, 1)
  assert.deepStrictEqual(records[0].events, ['create', 'bodySent', 'error'])
  assert.strictEqual(records[0].request.completed, false)
})

test('an HTTP/2 upgrade completes the request diagnostics lifecycle', async (testContext) => {
  const server = createSecureServer({
    ...(await pem.generate({ opts: { keySize: 2048 } })),
    settings: { enableConnectProtocol: true }
  })
  server.on('stream', (stream, headers) => {
    stream.on('error', onExpectedTeardownError)
    const statusCode = headers[':path'] === '/rejected' ? 403 : 200
    stream.respond({ ':status': statusCode }, { endStream: false })
    stream.resume()
    stream.once('end', () => stream.end())
  })
  testContext.after(() => server.close())

  server.listen(0)
  await once(server, 'listening')

  const records = observeRequestLifecycles(testContext)
  const client = new Client(`https://localhost:${server.address().port}`, {
    allowH2: true,
    connect: { rejectUnauthorized: false }
  })
  testContext.after(() => client.close())

  const { socket } = await client.upgrade({ path: '/', protocol: 'websocket' })
  testContext.after(() => socket.destroy())

  assert.strictEqual(records.length, 1)
  assert.deepStrictEqual(records[0].events, ['create', 'headers', 'trailers'])
  assert.strictEqual(records[0].request.completed, true)
  assert.strictEqual(records[0].responses[0].statusCode, 200)
  assert.strictEqual(records[0].responses[0].statusText, '')
  assert.deepStrictEqual(records[0].trailers, [[]])

  socket.end()
  await once(socket, 'close')

  await assert.rejects(client.upgrade({ path: '/rejected', protocol: 'websocket' }))

  assert.strictEqual(records.length, 2)
  assert.deepStrictEqual(records[1].events, ['create', 'headers', 'error'])
  assert.strictEqual(records[1].request.completed, false)
})
