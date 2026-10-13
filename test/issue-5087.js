'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test } = require('node:test')
const { createServer } = require('node:http2')
const { once } = require('node:events')

const { Client, Agent, RetryAgent, errors, request } = require('..')

function onExpectedTeardownError (error) {
  if (error.code !== 'ECONNRESET' && error.code !== 'ERR_HTTP2_STREAM_ERROR') {
    throw error
  }
}

function trackServerResources (server) {
  const sessions = new Set()
  const timers = new Set()

  server.on('error', onExpectedTeardownError)
  server.on('session', (session) => {
    session.on('error', onExpectedTeardownError)
    session.socket?.on('error', onExpectedTeardownError)
    sessions.add(session)
    session.on('close', () => sessions.delete(session))
  })
  server.on('connection', (socket) => socket.on('error', onExpectedTeardownError))

  return {
    setTimer (callback, delay) {
      const timer = setTimeout(() => {
        timers.delete(timer)
        callback()
      }, delay)
      timers.add(timer)
    },
    clearTimers () {
      for (const timer of timers) {
        clearTimeout(timer)
      }
      timers.clear()
    },
    async close () {
      for (const session of sessions) {
        session.destroy()
      }
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve())
      })
    }
  }
}

test('https://github.com/nodejs/undici/issues/5087 bodyTimeout over h2 rejects with BodyTimeoutError', async (t) => {
  const plan = tspl(t, { plan: 3 })
  const server = createServer()
  const resources = trackServerResources(server)

  server.on('stream', (stream) => {
    stream.on('error', onExpectedTeardownError)
    stream.respond({ ':status': 200, 'content-type': 'text/plain' })
    resources.setTimer(() => {
      try {
        stream.end('late')
      } catch {}
    }, 500)
  })

  await once(server.listen(0), 'listening')

  const client = new Client(`http://localhost:${server.address().port}`, {
    allowH2: true,
    useH2c: true,
    bodyTimeout: 50,
    headersTimeout: 50
  })
  t.after(async () => {
    resources.clearTimers()
    try {
      await client.destroy()
    } finally {
      await resources.close()
    }
  })

  const res = await client.request({ path: '/', method: 'GET' })

  let err = null
  try {
    await res.body.text()
  } catch (error) {
    err = error
  }

  plan.ok(err instanceof errors.BodyTimeoutError)
  plan.strictEqual(err.code, 'UND_ERR_BODY_TIMEOUT')
  plan.strictEqual(err.message, 'HTTP/2: "stream timeout after 50"')

  await plan.completed
})

test('https://github.com/nodejs/undici/issues/5087 headersTimeout over h2 rejects with HeadersTimeoutError', async (t) => {
  const plan = tspl(t, { plan: 3 })
  const server = createServer()
  const resources = trackServerResources(server)

  server.on('stream', (stream) => {
    stream.on('error', onExpectedTeardownError)
    resources.setTimer(() => {
      try {
        stream.close()
      } catch {}
    }, 500)
  })

  await once(server.listen(0), 'listening')

  const client = new Client(`http://localhost:${server.address().port}`, {
    allowH2: true,
    useH2c: true,
    bodyTimeout: 60_000,
    headersTimeout: 50
  })
  t.after(async () => {
    resources.clearTimers()
    try {
      await client.destroy()
    } finally {
      await resources.close()
    }
  })

  let err = null
  try {
    await client.request({ path: '/', method: 'GET' })
  } catch (error) {
    err = error
  }

  plan.ok(err instanceof errors.HeadersTimeoutError)
  plan.strictEqual(err.code, 'UND_ERR_HEADERS_TIMEOUT')
  plan.strictEqual(err.message, 'HTTP/2: "headers timeout after 50"')

  await plan.completed
})

test('https://github.com/nodejs/undici/issues/5087 RetryAgent retries h2 body timeouts by default error code matching', async (t) => {
  const plan = tspl(t, { plan: 2 })
  let hits = 0
  const server = createServer()
  const resources = trackServerResources(server)

  server.on('stream', (stream) => {
    stream.on('error', onExpectedTeardownError)
    hits += 1

    stream.respond({ ':status': 200, 'content-type': 'text/plain' })

    if (hits === 1) {
      resources.setTimer(() => {
        try {
          stream.end('late')
        } catch {}
      }, 500)
      return
    }

    stream.end(`ok after ${hits} attempt(s)`)
  })

  await once(server.listen(0), 'listening')

  const dispatcher = new RetryAgent(new Agent({
    allowH2: true,
    useH2c: true,
    bodyTimeout: 50,
    headersTimeout: 50
  }), {
    maxRetries: 3,
    minTimeout: 10,
    errorCodes: ['UND_ERR_BODY_TIMEOUT']
  })
  t.after(async () => {
    resources.clearTimers()
    try {
      await dispatcher.destroy()
    } finally {
      await resources.close()
    }
  })

  const res = await request(`http://localhost:${server.address().port}/`, {
    dispatcher,
    method: 'GET'
  })

  plan.strictEqual(await res.body.text(), 'ok after 2 attempt(s)')
  plan.strictEqual(hits, 2)

  await plan.completed
})
