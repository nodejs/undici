'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createSecureServer, constants } = require('node:http2')
const { once } = require('node:events')
const { Readable } = require('node:stream')

const pem = require('@metcoder95/https-pem')

const { Client } = require('..')

test('#2364 - Concurrent aborts', async t => {
  t = tspl(t, { plan: 10 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  // Concurrent aborts can cause the client to RST_STREAM / close the session
  // while server-side timers are still pending; swallow the resulting
  // ECONNRESET that fires on the session, the socket, or the server itself
  // after the test body resolves (macOS/Windows surface this more often than
  // Linux).
  server.on('error', () => {})
  server.on('session', session => {
    session.on('error', () => {})
    session.socket?.on('error', () => {})
  })
  server.on('secureConnection', socket => socket.on('error', () => {}))

  server.on('stream', (stream, headers, _flags, rawHeaders) => {
    setTimeout(() => {
      // The peer may have reset the stream from an AbortSignal before we
      // respond; guard against ERR_HTTP2_INVALID_STREAM.
      if (stream.destroyed || stream.closed) return
      stream.respond({
        'content-type': 'text/plain; charset=utf-8',
        'x-custom-h2': 'hello',
        ':status': 200
      })
      stream.end('hello h2!')
    }, 100)
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  after(() => client.close().catch(() => {}))
  const signal = AbortSignal.timeout(100)

  client.request(
    {
      path: '/1',
      method: 'GET',
      headers: {
        'x-my-header': 'foo'
      }
    },
    (err, response) => {
      t.ifError(err)
      t.strictEqual(
        response.headers['content-type'],
        'text/plain; charset=utf-8'
      )
      t.strictEqual(response.headers['x-custom-h2'], 'hello')
      t.strictEqual(response.statusCode, 200)
    }
  )

  client.request(
    {
      path: '/2',
      method: 'GET',
      headers: {
        'x-my-header': 'foo'
      },
      signal
    },
    (err, response) => {
      t.strictEqual(err.name, 'TimeoutError')
    }
  )

  client.request(
    {
      path: '/3',
      method: 'GET',
      headers: {
        'x-my-header': 'foo'
      }
    },
    (err, response) => {
      t.ifError(err)
      t.strictEqual(
        response.headers['content-type'],
        'text/plain; charset=utf-8'
      )
      t.strictEqual(response.headers['x-custom-h2'], 'hello')
      t.strictEqual(response.statusCode, 200)
    }
  )

  client.request(
    {
      path: '/4',
      method: 'GET',
      headers: {
        'x-my-header': 'foo'
      },
      signal
    },
    (err, response) => {
      t.strictEqual(err.name, 'TimeoutError')
    }
  )

  await t.completed
  // Close the client inside the test body so the resulting session/socket
  // teardown (and any ECONNRESET it generates) lands while the test is still
  // running — otherwise node:test flags it as "async activity after the test
  // ended" on macOS/Windows.
  await client.close()
})

test('#6187 - abort while the request body is queued behind flow control sends RST_STREAM(CANCEL)', async t => {
  t = tspl(t, { plan: 4 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  server.on('error', () => {})
  server.on('session', session => {
    session.on('error', () => {})
    session.socket?.on('error', () => {})
  })
  server.on('secureConnection', socket => socket.on('error', () => {}))

  let notifyStream
  const streamReceived = new Promise(resolve => { notifyStream = resolve })
  let notifyClose
  const streamClosed = new Promise(resolve => { notifyClose = resolve })
  let rstCode

  server.on('stream', (stream, headers) => {
    stream.on('error', () => {})

    if (headers[':path'] === '/ok') {
      stream.respond({
        'content-type': 'text/plain; charset=utf-8',
        ':status': 200
      })
      stream.end('hello h2!')
      return
    }

    // Never read the body: the upload stalls at the initial flow-control
    // window with most of the 2 MiB body still queued on the client.
    stream.on('close', () => {
      rstCode = stream.rstCode
      notifyClose()
    })
    notifyStream()
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })
  after(() => client.close().catch(() => {}))

  const ac = new AbortController()
  const requestPromise = client.request({
    path: '/',
    method: 'POST',
    body: Buffer.alloc(2 * 1024 * 1024),
    signal: ac.signal
  })

  // Abort only once the server has the stream, so the body is already
  // queued behind flow control when the abort lands.
  await streamReceived
  ac.abort()

  const err = await requestPromise.then(() => null, err => err)
  t.ok(err, 'the aborted request rejects')

  // The fix submits RST_STREAM synchronously with the abort, so 2 s is a
  // generous bound. Without it, close() defers the reset until the queued
  // body flushes, and the server only sees the stream go away seconds later
  // (or, once it grants window, not at all: the session loops instead).
  let timer
  const closed = await Promise.race([
    streamClosed.then(() => true),
    new Promise(resolve => { timer = setTimeout(() => resolve(false), 2000) })
  ]).finally(() => clearTimeout(timer))
  t.strictEqual(closed, true, 'the server sees the stream close promptly after the abort')
  t.strictEqual(rstCode, constants.NGHTTP2_CANCEL, 'the server receives RST_STREAM(CANCEL)')

  // The orphaned stream must not wedge the session: a follow-up request on
  // the same client still succeeds.
  const res = await client.request({ path: '/ok', method: 'GET' })
  t.strictEqual(res.statusCode, 200)
  await res.body.text()

  await t.completed
  await client.close()
})

test('#6187 - abort while a streaming body is still being piped sends RST_STREAM(CANCEL)', async t => {
  t = tspl(t, { plan: 3 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  server.on('error', () => {})
  server.on('session', session => {
    session.on('error', () => {})
    session.socket?.on('error', () => {})
  })
  server.on('secureConnection', socket => socket.on('error', () => {}))

  let notifyStream
  const streamReceived = new Promise(resolve => { notifyStream = resolve })
  let notifyClose
  const streamClosed = new Promise(resolve => { notifyClose = resolve })
  let rstCode

  server.on('stream', (stream) => {
    stream.on('error', () => {})
    // Never read: the piped body stalls behind flow control mid-upload.
    stream.on('close', () => {
      rstCode = stream.rstCode
      notifyClose()
    })
    notifyStream()
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })
  after(() => client.close().catch(() => {}))

  // 2 MiB in 64 KiB chunks, then the source stalls without ending, so the
  // request is still uploading when the abort lands.
  let pushed = 0
  const body = new Readable({
    read () {
      if (pushed < 32) {
        this.push(Buffer.alloc(64 * 1024))
        pushed++
      }
    }
  })

  const ac = new AbortController()
  const requestPromise = client.request({
    path: '/',
    method: 'POST',
    body,
    signal: ac.signal
  })

  await streamReceived
  ac.abort()

  const err = await requestPromise.then(() => null, err => err)
  t.ok(err, 'the aborted request rejects')

  let timer
  const closed = await Promise.race([
    streamClosed.then(() => true),
    new Promise(resolve => { timer = setTimeout(() => resolve(false), 2000) })
  ]).finally(() => clearTimeout(timer))
  t.strictEqual(closed, true, 'the server sees the stream close promptly after the abort')
  t.strictEqual(rstCode, constants.NGHTTP2_CANCEL, 'the server receives RST_STREAM(CANCEL)')

  await t.completed
  await client.close()
})

test('#2364 - Concurrent aborts (2nd variant)', async t => {
  t = tspl(t, { plan: 10 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  // Concurrent aborts can cause the client to RST_STREAM / close the session
  // while server-side timers are still pending; swallow the resulting
  // ECONNRESET that fires on the session, the socket, or the server itself
  // after the test body resolves (macOS/Windows surface this more often than
  // Linux).
  server.on('error', () => {})
  server.on('session', session => {
    session.on('error', () => {})
    session.socket?.on('error', () => {})
  })
  server.on('secureConnection', socket => socket.on('error', () => {}))
  let counter = 0

  server.on('stream', (stream, headers, _flags, rawHeaders) => {
    counter++

    if (counter % 2 === 0) {
      setTimeout(() => {
        if (stream.destroyed) {
          return
        }

        stream.respond({
          'content-type': 'text/plain; charset=utf-8',
          'x-custom-h2': 'hello',
          ':status': 200
        })

        stream.end('hello h2!')
      }, 400)

      return
    }

    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': 'hello',
      ':status': 200
    })

    stream.end('hello h2!')
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })
  after(() => client.close().catch(() => {}))

  const signal = AbortSignal.timeout(300)

  client.request(
    {
      path: '/1',
      method: 'GET',
      headers: {
        'x-my-header': 'foo'
      }
    },
    (err, response) => {
      t.ifError(err)
      t.strictEqual(
        response.headers['content-type'],
        'text/plain; charset=utf-8'
      )
      t.strictEqual(response.headers['x-custom-h2'], 'hello')
      t.strictEqual(response.statusCode, 200)
    }
  )

  client.request(
    {
      path: '/2',
      method: 'GET',
      headers: {
        'x-my-header': 'foo'
      },
      signal
    },
    (err, response) => {
      t.strictEqual(err.name, 'TimeoutError')
    }
  )

  client.request(
    {
      path: '/3',
      method: 'GET',
      headers: {
        'x-my-header': 'foo'
      }
    },
    (err, response) => {
      t.ifError(err)
      t.strictEqual(
        response.headers['content-type'],
        'text/plain; charset=utf-8'
      )
      t.strictEqual(response.headers['x-custom-h2'], 'hello')
      t.strictEqual(response.statusCode, 200)
    }
  )

  client.request(
    {
      path: '/4',
      method: 'GET',
      headers: {
        'x-my-header': 'foo'
      },
      signal
    },
    (err, response) => {
      t.strictEqual(err.name, 'TimeoutError')
    }
  )

  await t.completed
  // See first variant — close inside the test body to keep teardown noise
  // inside the test lifetime. Also wait for the server's 400ms timer to
  // fire (it will no-op on a destroyed stream) before letting the test end.
  await client.close()
  await new Promise(resolve => setTimeout(resolve, 500))
})
