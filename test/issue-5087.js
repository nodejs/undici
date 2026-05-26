'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createServer } = require('node:http2')
const { once } = require('node:events')

const { Client, Agent, RetryAgent, errors, request } = require('..')

test('https://github.com/nodejs/undici/issues/5087 bodyTimeout over h2 rejects with BodyTimeoutError', async (t) => {
  t = tspl(t, { plan: 3 })

  const server = createServer()
  server.on('stream', (stream) => {
    stream.respond({ ':status': 200, 'content-type': 'text/plain' })
    setTimeout(() => {
      try {
        stream.end('late')
      } catch {}
    }, 500)
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`http://localhost:${server.address().port}`, {
    allowH2: true,
    useH2c: true,
    bodyTimeout: 50,
    headersTimeout: 50
  })
  after(() => client.close())

  const res = await client.request({ path: '/', method: 'GET' })

  let err = null
  try {
    await res.body.text()
  } catch (error) {
    err = error
  }

  t.ok(err instanceof errors.BodyTimeoutError)
  t.strictEqual(err.code, 'UND_ERR_BODY_TIMEOUT')
  t.strictEqual(err.message, 'HTTP/2: "stream timeout after 50"')

  await t.completed
})

test('https://github.com/nodejs/undici/issues/5087 headersTimeout over h2 rejects with HeadersTimeoutError', async (t) => {
  t = tspl(t, { plan: 3 })

  const server = createServer()
  server.on('stream', (stream) => {
    setTimeout(() => {
      try {
        stream.close()
      } catch {}
    }, 500)
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`http://localhost:${server.address().port}`, {
    allowH2: true,
    useH2c: true,
    bodyTimeout: 60_000,
    headersTimeout: 50
  })
  after(() => client.close())

  let err = null
  try {
    await client.request({ path: '/', method: 'GET' })
  } catch (error) {
    err = error
  }

  t.ok(err instanceof errors.HeadersTimeoutError)
  t.strictEqual(err.code, 'UND_ERR_HEADERS_TIMEOUT')
  t.strictEqual(err.message, 'HTTP/2: "headers timeout after 50"')

  await t.completed
})

test('https://github.com/nodejs/undici/issues/5087 RetryAgent retries h2 body timeouts by default error code matching', async (t) => {
  t = tspl(t, { plan: 2 })

  let hits = 0
  const server = createServer()
  server.on('stream', (stream) => {
    hits += 1

    stream.respond({ ':status': 200, 'content-type': 'text/plain' })

    if (hits === 1) {
      setTimeout(() => {
        try {
          stream.end('late')
        } catch {}
      }, 500)
      return
    }

    stream.end(`ok after ${hits} attempt(s)`)
  })

  after(() => server.close())
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
  after(() => dispatcher.close())

  const res = await request(`http://localhost:${server.address().port}/`, {
    dispatcher,
    method: 'GET'
  })

  t.strictEqual(await res.body.text(), 'ok after 2 attempt(s)')
  t.strictEqual(hits, 2)

  await t.completed
})
