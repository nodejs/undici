'use strict'

const { test, after } = require('node:test')
const { createSecureServer } = require('node:http2')
const { once } = require('node:events')
const { setTimeout: sleep } = require('node:timers/promises')

const { tspl } = require('@matteo.collina/tspl')
const pem = require('@metcoder95/https-pem')

const { Agent, request } = require('..')

test('HTTP/2 POST requests multiplex on an established session', async t => {
  const p = tspl(t, { plan: 1 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  const measuredStreams = []
  const measuredRequests = 5
  let releaseImmediately = false

  function respond (stream) {
    if (!stream.closed && !stream.destroyed) {
      stream.respond({ ':status': 200 })
      stream.end('ok')
    }
  }

  function flushMeasuredStreams () {
    for (const stream of measuredStreams) {
      respond(stream)
    }
  }

  server.on('stream', (stream, headers) => {
    stream.on('error', () => {})

    if (headers[':path'] === '/warmup') {
      respond(stream)
      return
    }

    measuredStreams.push(stream)

    if (releaseImmediately || measuredStreams.length === measuredRequests) {
      releaseImmediately = true
      flushMeasuredStreams()
    }
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const agent = new Agent({
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true,
    connections: 1
  })
  after(() => agent.close())

  const origin = `https://localhost:${server.address().port}`
  const warmup = await request(`${origin}/warmup`, { dispatcher: agent })
  await warmup.body.text()

  const requests = Promise.all(Array.from({ length: measuredRequests }, () => {
    return request(origin, {
      dispatcher: agent,
      method: 'POST',
      body: 'hello'
    }).then(response => response.body.text())
  }))

  await sleep(500)

  const concurrentStreams = measuredStreams.length

  releaseImmediately = true
  flushMeasuredStreams()
  await requests

  p.strictEqual(concurrentStreams, measuredRequests)

  await p.completed
})
