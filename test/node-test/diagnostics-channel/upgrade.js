'use strict'

const assert = require('node:assert/strict')
const diagnosticsChannel = require('node:diagnostics_channel')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { constants: { NGHTTP2_CANCEL, NGHTTP2_INTERNAL_ERROR }, createSecureServer } = require('node:http2')
const { PassThrough } = require('node:stream')
const { test } = require('node:test')

const pem = require('@metcoder95/https-pem')

const { Agent, Client, connect, getGlobalDispatcher, setGlobalDispatcher } = require('../../..')

const expectedTeardownErrorCodes = new Set(['ECONNRESET', 'ERR_HTTP2_STREAM_ERROR'])

const requestChannels = {
  bodySent: diagnosticsChannel.channel('undici:request:bodySent'),
  create: diagnosticsChannel.channel('undici:request:create'),
  error: diagnosticsChannel.channel('undici:request:error'),
  headers: diagnosticsChannel.channel('undici:request:headers'),
  trailers: diagnosticsChannel.channel('undici:request:trailers')
}

/**
 * @param {import('node:stream').Duplex} stream
 * @param {Error} expectedError
 */
function waitForStreamClose (stream, expectedError) {
  return new Promise((resolve, reject) => {
    stream.once('close', resolve)
    stream.once('error', (error) => {
      if (error !== expectedError) {
        reject(error)
      }
    })
  })
}

/**
 * @param {import('node:stream').Duplex} stream
 */
function waitForServerStreamClose (stream) {
  return new Promise((resolve, reject) => {
    stream.once('close', resolve)
    stream.once('error', (error) => {
      if (!expectedTeardownErrorCodes.has(error.code)) {
        reject(error)
      }
    })
  })
}

/**
 * @param {import('node:stream').Duplex} stream
 */
async function waitForStreamErrorAndClose (stream) {
  const errorReceived = once(stream, 'error')
  const streamClosed = new Promise(resolve => stream.once('close', resolve))
  const [[error]] = await Promise.all([errorReceived, streamClosed])
  return error
}

/**
 * @param {import('node:test').TestContext} testContext
 */
function observeRequestLifecycles (testContext) {
  const records = []
  const recordsByRequest = new Map()
  const subscriptions = {
    bodySent ({ request }) {
      recordsByRequest.get(request).events.push('bodySent')
    },
    create ({ request }) {
      const record = { request, errors: [], events: ['create'], responses: [], trailers: [] }
      records.push(record)
      recordsByRequest.set(request, record)
    },
    error ({ request, error }) {
      const record = recordsByRequest.get(request)
      record.events.push('error')
      record.errors.push(error)
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
  const { headers, socket } = await upgrade
  assert.strictEqual(headers.connection, 'Upgrade')
  assert.strictEqual(headers.upgrade, 'test')
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
  assert.strictEqual(tunnel.statusCode, 200)
  tunnel.socket.destroy()

  assert.strictEqual(records.length, 2)
  assert.deepStrictEqual(records[1].events, ['create', 'bodySent', 'headers', 'trailers'])
  assert.strictEqual(records[1].request.completed, true)
  assert.strictEqual(records[1].responses[0].statusCode, 200)
  assert.strictEqual(records[1].responses[0].statusText, 'Connection Established')
  assert.deepStrictEqual(records[1].trailers, [[]])
})

test('completed upgrades retain transport abort without reopening request diagnostics', async (testContext) => {
  const serverSockets = new Set()
  const server = createServer()
  server.on('upgrade', (_request, socket) => {
    serverSockets.add(socket)
    socket.once('close', () => serverSockets.delete(socket))
    socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: test\r\n\r\n')
  })
  server.on('connect', (_request, socket) => {
    serverSockets.add(socket)
    socket.once('close', () => serverSockets.delete(socket))
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
  })
  testContext.after(() => {
    for (const socket of serverSockets) {
      socket.destroy()
    }
    server.close()
  })

  server.listen(0)
  await once(server, 'listening')

  const records = observeRequestLifecycles(testContext)
  const client = new Client(`http://127.0.0.1:${server.address().port}`)
  testContext.after(() => client.close())

  const requests = [
    { method: 'GET', path: '/', upgrade: 'test' },
    { method: 'CONNECT', path: '/' }
  ]

  for (const options of requests) {
    let abort
    const socket = await new Promise((resolve, reject) => {
      client.dispatch(options, {
        onConnect (abortRequest) {
          abort = abortRequest
        },
        onUpgrade (_statusCode, _headers, socket) {
          resolve(socket)
        },
        onError: reject
      })
    })

    const socketClosure = waitForStreamErrorAndClose(socket)
    abort()
    const error = await socketClosure
    assert.strictEqual(error.code, 'UND_ERR_INFO')
    assert.strictEqual(error.message, 'aborted')
  }

  assert.strictEqual(records.length, 2)
  assert.deepStrictEqual(records[0].events, ['create', 'bodySent', 'headers', 'trailers'])
  assert.deepStrictEqual(records[1].events, ['create', 'bodySent', 'headers', 'trailers'])
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

test('upgrade handler errors and aborts terminate the request diagnostics lifecycle', async (testContext) => {
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
  await new Promise((resolve, reject) => {
    client.dispatch({ method: 'GET', path: '/', upgrade: 'test' }, {
      onConnect () {},
      onUpgrade () {
        throw expectedError
      },
      onError (error) {
        if (error === expectedError) {
          resolve()
        } else {
          reject(error)
        }
      }
    })
  })

  assert.strictEqual(records.length, 1)
  assert.deepStrictEqual(records[0].events, ['create', 'bodySent', 'headers', 'error'])
  assert.strictEqual(records[0].request.completed, false)
  assert.strictEqual(records[0].request.aborted, true)

  const expectedAbort = new Error('upgrade handler aborted')
  let abort
  await new Promise((resolve, reject) => {
    client.dispatch({ method: 'GET', path: '/', upgrade: 'test' }, {
      onConnect (abortRequest) {
        abort = abortRequest
      },
      onUpgrade () {
        abort(expectedAbort)
      },
      onError (error) {
        if (error === expectedAbort) {
          resolve()
        } else {
          reject(error)
        }
      }
    })
  })
  abort(expectedAbort)

  assert.strictEqual(records.length, 2)
  assert.deepStrictEqual(records[1].events, ['create', 'bodySent', 'headers', 'error'])
  assert.strictEqual(records[1].request.completed, false)
  assert.strictEqual(records[1].request.aborted, true)
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
  const upgradeRejected = assert.rejects(upgrade, { name: 'AbortError' })
  await once(server, 'upgrade')
  abortController.abort()
  await upgradeRejected

  assert.strictEqual(records.length, 1)
  assert.deepStrictEqual(records[0].events, ['create', 'bodySent', 'error'])
  assert.strictEqual(records[0].request.completed, false)
})

test('HTTP/2 CONNECT preserves callback timing and completes diagnostics', async (testContext) => {
  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  const serverStreamClosures = []
  server.on('stream', (stream, headers) => {
    serverStreamClosures.push(waitForServerStreamClose(stream))
    if (headers[':method'] !== 'CONNECT') {
      stream.respond({ ':status': 204 })
      stream.end()
      return
    }
    if (headers['x-cancel'] === 'true') {
      server.emit('cancelStream', stream)
      return
    }
    if (headers['x-error'] === 'true') {
      server.emit('errorStream', stream)
      return
    }
    if (headers['x-retained-abort'] === 'true') {
      server.emit('retainedAbortStream', stream)
      return
    }
    if (headers['x-completed-abort'] === 'true') {
      server.emit('completedAbortStream', stream)
      return
    }
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

  const serverStreamReceived = once(server, 'stream')
  const connection = client.connect({ path: '/' })
  const [serverStream] = await serverStreamReceived
  const { statusCode, headers, socket } = await connection

  assert.strictEqual(statusCode, null)
  assert.strictEqual(headers, null)
  assert.strictEqual(records.length, 1)
  assert.deepStrictEqual(records[0].events, ['create'])
  assert.strictEqual(records[0].request.completed, true)

  const responseReceived = once(socket, 'response')
  serverStream.respond({ ':status': 200, 'x-custom': 'custom-header' }, { endStream: false })
  await responseReceived

  assert.deepStrictEqual(records[0].events, ['create', 'headers', 'trailers'])
  assert.strictEqual(records[0].responses[0].statusCode, 200)
  assert.strictEqual(records[0].responses[0].statusText, '')
  assert.deepStrictEqual(records[0].trailers, [[]])

  const session = socket.session
  const socketClosed = once(socket, 'close')
  socket.end()
  await socketClosed

  const expectedError = new Error('CONNECT handler failed')
  let errorStreamClosed
  const handlerError = new Promise((resolve, reject) => {
    client.dispatch({ method: 'CONNECT', path: '/' }, {
      onConnect () {},
      onUpgrade (_statusCode, _headers, stream) {
        assert.strictEqual(stream.session, session)
        errorStreamClosed = waitForStreamClose(stream, expectedError)
        throw expectedError
      },
      onError (error) {
        if (error === expectedError) {
          resolve()
        } else {
          reject(error)
        }
      }
    })
  })

  await handlerError
  await errorStreamClosed

  assert.strictEqual(records.length, 2)
  assert.deepStrictEqual(records[1].events, ['create', 'error'])
  assert.strictEqual(records[1].request.completed, false)
  assert.strictEqual(records[1].request.aborted, true)
  const openStreams = Object.getOwnPropertySymbols(session).find(symbol => symbol.description === 'open streams')
  assert.ok(openStreams)
  assert.strictEqual(session[openStreams], 0)

  let abort
  let abortedStreamClosed
  const handlerAbort = new Promise((resolve) => {
    client.dispatch({ method: 'CONNECT', path: '/' }, {
      onConnect (abortRequest) {
        abort = abortRequest
      },
      onUpgrade (_statusCode, _headers, stream) {
        assert.strictEqual(stream.session, session)
        abortedStreamClosed = waitForStreamErrorAndClose(stream)
        abort()
      },
      onError (error) {
        resolve(error)
      }
    })
  })

  const handlerAbortError = await handlerAbort
  const streamAbortError = await abortedStreamClosed
  assert.strictEqual(handlerAbortError, streamAbortError)
  assert.strictEqual(handlerAbortError.code, 'UND_ERR_ABORTED')

  assert.strictEqual(records.length, 3)
  assert.deepStrictEqual(records[2].events, ['create', 'error'])
  assert.strictEqual(records[2].request.completed, false)
  assert.strictEqual(records[2].request.aborted, true)
  assert.strictEqual(session[openStreams], 0)

  const retainedAbortStreamReceived = once(server, 'retainedAbortStream')
  let retainedAbort
  const retainedAbortStream = await new Promise((resolve, reject) => {
    client.dispatch({ method: 'CONNECT', path: '/', headers: { 'x-retained-abort': 'true' } }, {
      onConnect (abortRequest) {
        retainedAbort = abortRequest
      },
      onUpgrade (_statusCode, _headers, stream) {
        resolve(stream)
      },
      onError: reject
    })
  })
  await retainedAbortStreamReceived

  const retainedAbortStreamClosed = waitForStreamErrorAndClose(retainedAbortStream)
  retainedAbort()
  assert.strictEqual(retainedAbortStream.destroyed, true)
  const retainedAbortError = await retainedAbortStreamClosed
  assert.strictEqual(retainedAbortError.code, 'UND_ERR_ABORTED')

  assert.strictEqual(records.length, 4)
  assert.deepStrictEqual(records[3].events, ['create', 'error'])
  assert.strictEqual(records[3].errors[0], retainedAbortError)
  assert.strictEqual(records[3].request.completed, true)
  assert.strictEqual(records[3].request.aborted, false)
  assert.strictEqual(session[openStreams], 0)

  const completedAbortStreamReceived = once(server, 'completedAbortStream')
  let completedAbort
  const completedAbortStream = await new Promise((resolve, reject) => {
    client.dispatch({ method: 'CONNECT', path: '/', headers: { 'x-completed-abort': 'true' } }, {
      onConnect (abortRequest) {
        completedAbort = abortRequest
      },
      onUpgrade (_statusCode, _headers, stream) {
        resolve(stream)
      },
      onError: reject
    })
  })
  const [completedAbortServerStream] = await completedAbortStreamReceived
  const completedAbortResponseReceived = once(completedAbortStream, 'response')
  completedAbortServerStream.respond({ ':status': 200 }, { endStream: false })
  await completedAbortResponseReceived

  assert.strictEqual(records.length, 5)
  assert.deepStrictEqual(records[4].events, ['create', 'headers', 'trailers'])

  const expectedCompletedAbort = new Error('completed CONNECT abort')
  const completedAbortStreamClosed = waitForStreamClose(completedAbortStream, expectedCompletedAbort)
  completedAbort(expectedCompletedAbort)
  assert.strictEqual(completedAbortStream.destroyed, true)
  await completedAbortStreamClosed

  assert.deepStrictEqual(records[4].events, ['create', 'headers', 'trailers'])
  assert.strictEqual(records[4].request.completed, true)
  assert.strictEqual(records[4].request.aborted, false)
  assert.strictEqual(session[openStreams], 0)

  const cancelledStreamReceived = once(server, 'cancelStream')
  const cancelledConnection = client.connect({ path: '/', headers: { 'x-cancel': 'true' } })
  const [cancelledServerStream] = await cancelledStreamReceived
  const { socket: cancelledStream } = await cancelledConnection
  const cancelledStreamClosed = once(cancelledStream, 'close')
  cancelledServerStream.close(NGHTTP2_CANCEL)
  await cancelledStreamClosed

  assert.strictEqual(records.length, 6)
  assert.deepStrictEqual(records[5].events, ['create', 'error'])
  assert.strictEqual(records[5].errors[0].code, 'UND_ERR_INFO')
  assert.strictEqual(records[5].errors[0].message, 'HTTP/2: "stream error" received - code 8')
  assert.strictEqual(records[5].request.completed, true)
  assert.strictEqual(records[5].request.aborted, false)
  assert.strictEqual(session[openStreams], 0)

  const erroredStreamReceived = once(server, 'errorStream')
  const erroredConnection = client.connect({ path: '/', headers: { 'x-error': 'true' } })
  const [erroredServerStream] = await erroredStreamReceived
  const { socket: erroredStream } = await erroredConnection
  const streamError = waitForStreamErrorAndClose(erroredStream)
  erroredServerStream.close(NGHTTP2_INTERNAL_ERROR)
  const responseError = await streamError

  assert.strictEqual(records.length, 7)
  assert.deepStrictEqual(records[6].events, ['create', 'error'])
  assert.strictEqual(records[6].errors[0], responseError)
  assert.strictEqual(records[6].request.completed, true)
  assert.strictEqual(records[6].request.aborted, false)
  assert.strictEqual(session[openStreams], 0)

  const response = await client.request({ method: 'GET', path: '/' })
  assert.strictEqual(response.statusCode, 204)
  await response.body.text()
  await Promise.all(serverStreamClosures)
})
