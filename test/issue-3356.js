'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { tick: fastTimersTick } = require('../lib/util/timers')
const { fetch, Agent, RetryAgent } = require('..')

test('https://github.com/nodejs/undici/issues/3356', { skip: process.env.CITGM }, async (t) => {
  t = tspl(t, { plan: 3 })

  let requestCount = 0
  const server = createServer({ joinDuplicateHeaders: true })
  server.on('request', (req, res) => {
    requestCount++
    res.writeHead(200, { 'content-type': 'text/plain' })
    if (requestCount === 1) {
      // First request: send headers and partial body, then delay the rest
      // long enough for the bodyTimeout to fire via fast timers
      res.flushHeaders()
      res.write('h')
      setTimeout(() => { res.end('ello world!') }, 3000)
    } else {
      res.end('hello world!')
    }
  })

  server.listen(0)

  await once(server, 'listening')

  const agent = new RetryAgent(new Agent({ bodyTimeout: 1500 }), {
    errorCodes: ['UND_ERR_BODY_TIMEOUT'],
    minTimeout: 10,
    maxTimeout: 100
  })

  after(async () => {
    await agent.close()
    server.close()

    await once(server, 'close')
  })

  const response = await fetch(`http://localhost:${server.address().port}`, {
    dispatcher: agent
  })

  // Advance fast timers to trigger the body timeout.
  // The fast timer resolution is ~1s, so we need to tick past the 1500ms bodyTimeout.
  fastTimersTick(2000)

  try {
    t.equal(response.status, 200)
    // consume response - this should throw because the retry mechanism
    // cannot transparently retry after headers have already been forwarded
    await response.text()
  } catch (err) {
    t.equal(err.name, 'TypeError')
    t.equal(err.cause.code, 'UND_ERR_REQ_RETRY')
  }

  await t.completed
})
