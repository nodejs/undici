'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { tick: fastTimerTick } = require('../lib/util/timers')
const { fetch, Agent, RetryAgent } = require('..')

test('https://github.com/nodejs/undici/issues/3356', async (t) => {
  t = tspl(t, { plan: 3 })

  let shouldRetry = true
  const server = createServer()
  server.on('request', (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    if (shouldRetry) {
      shouldRetry = false

      res.flushHeaders()
      res.write('h')
      setTimeout(() => { res.end('ello world!') }, 100)
    } else {
      res.end('hello world!')
    }
  })

  server.listen(0)

  await once(server, 'listening')

  after(async () => {
    server.close()

    await once(server, 'close')
  })

  const agent = new RetryAgent(new Agent({ bodyTimeout: 50 }), {
    errorCodes: ['UND_ERR_BODY_TIMEOUT']
  })

  const response = await fetch(`http://localhost:${server.address().port}`, {
    dispatcher: agent
  })

  fastTimerTick()

  setTimeout(async () => {
    try {
      t.equal(response.status, 200)
      // consume response
      await response.text()
    } catch (err) {
      t.equal(err.name, 'TypeError')
      t.equal(err.cause.code, 'UND_ERR_REQ_RETRY')
    }
  }, 200)

  await t.completed
})
