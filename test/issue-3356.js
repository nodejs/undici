'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { fetch, Agent, RetryAgent } = require('..')

test('https://github.com/nodejs/undici/issues/3356', async (t) => {
  t = tspl(t, { plan: 3 })

  let callCount = 0
  const server = createServer({ joinDuplicateHeaders: true })
  server.on('request', (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.flushHeaders()
    res.write('h')

    if (callCount++ === 0) {
      res.write('ahahaha')
      // never end the response
    } else {
      t.fail('should not be called twice')
    }
  })

  await once(server.listen(0), 'listening')

  after(() => once(server.close(), 'close'))

  const agent = new RetryAgent(new Agent({ bodyTimeout: 50 }), {
    errorCodes: ['UND_ERR_BODY_TIMEOUT']
  })

  const response = await fetch(`http://localhost:${server.address().port}`, {
    dispatcher: agent
  })

  t.equal(response.status, 200)

  try {
    await response.text()
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.name, 'TypeError')
    t.equal(err.cause.code, 'UND_ERR_BODY_TIMEOUT')
  }

  await t.completed
})

test('https://github.com/nodejs/undici/issues/3356', { skip: true }, async (t) => {
  t = tspl(t, { plan: 2 })

  let callCount = 0
  const server = createServer({ joinDuplicateHeaders: true })
  server.on('request', (req, res) => {
    if (callCount++ === 0) {
      res.writeHead(206, {
        'content-type': 'text/plain',
        'content-range': 'bytes 0-12/12'
      })
      res.flushHeaders()
      res.write('h')

      // never end the response
    } else if (callCount === 1) {
      console.log(req.headers['accept-ranges'])
      res.writeHead(206, {
        'content-type': 'text/plain',
        'content-range': 'bytes 1-12/12'
      })
      res.flushHeaders()
      res.write('ello world!')
      res.end()
    }
  })

  await once(server.listen(0), 'listening')

  after(() => once(server.close(), 'close'))

  const agent = new RetryAgent(new Agent({ bodyTimeout: 50 }), {
    errorCodes: ['UND_ERR_BODY_TIMEOUT']
  })

  const response = await fetch(`http://localhost:${server.address().port}`, {
    dispatcher: agent
  })

  t.equal(response.status, 206)

  t.equal(await response.text(), 'hello world!')

  await t.completed
})
