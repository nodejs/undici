'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')

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
      setTimeout(() => { res.end('ello world!') }, 1000)
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

  const agent = new RetryAgent(new Agent({ bodyTimeout: 500 }), {
    errorCodes: ['UND_ERR_BODY_TIMEOUT']
  })

  const response = await fetch(`http://localhost:${server.address().port}`, {
    dispatcher: agent
  })
  t.equal(response.status, 200)
  t.equal(await response.text(), 'hello world!')
})
