'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { tick: fastTimersTick } = require('../lib/util/timers')
const { fetch, Agent, RetryAgent } = require('..')

test('https://github.com/nodejs/undici/issues/3356', async (t) => {
  t = tspl(t, { plan: 2 })

  let shouldRetry = true
  const server = createServer()
  server.on('request', (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    if (shouldRetry) {
      shouldRetry = false

      res.flushHeaders()
      res.write('h')
    } else {
      res.end('hello world!')
    }
  })

  server.listen(0)

  await once(server, 'listening')

  const agent = new RetryAgent(new Agent({ bodyTimeout: 50 }), {
    errorCodes: ['UND_ERR_BODY_TIMEOUT']
  })

  after(async () => {
    await agent.close()
    server.close()

    await once(server, 'close')
  })

  const response = await fetch(`http://localhost:${server.address().port}`, {
    dispatcher: agent
  })
  const reader = response.body.getReader()

  await reader.read()

  fastTimersTick()

  t.equal(response.status, 200)
  await t.rejects(reader.read(), /** @param {Error & { cause: { code: string } }} error */ (error) => {
    return error.name === 'TypeError' &&
      error.cause.code === 'UND_ERR_REQ_RETRY'
  })

  await t.completed
})
