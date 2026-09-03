'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { Writable } = require('node:stream')

const { RetryAgent, Client } = require('..')
test('Should retry status code', async t => {
  t = tspl(t, { plan: 2 })

  let counter = 0
  const server = createServer({ joinDuplicateHeaders: true })
  const opts = {
    maxRetries: 5,
    timeout: 1,
    timeoutFactor: 1
  }

  server.on('request', (req, res) => {
    switch (counter++) {
      case 0:
        req.destroy()
        return
      case 1:
        res.writeHead(500)
        res.end('failed')
        return
      case 2:
        res.writeHead(200)
        res.end('hello world!')
        return
      default:
        t.fail()
    }
  })

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const agent = new RetryAgent(client, opts)

    after(async () => {
      await agent.close()
      server.close()

      await once(server, 'close')
    })

    agent.request({
      method: 'GET',
      path: '/',
      headers: {
        'content-type': 'application/json'
      }
    }).then((res) => {
      t.equal(res.statusCode, 200)
      res.body.setEncoding('utf8')
      let chunks = ''
      res.body.on('data', chunk => { chunks += chunk })
      res.body.on('end', () => {
        t.equal(chunks, 'hello world!')
      })
    })
  })

  await t.completed
})

for (const throwOnError of [true, false]) {
  test(`Should reject a non-206 response when resuming a partially consumed response | throwOnError: ${throwOnError}`, async context => {
    const t = tspl(context, { plan: 4 })

    let requestCount = 0
    const chunks = []
    const server = createServer((req, res) => {
      if (requestCount++ === 0) {
        res.writeHead(200, { 'content-length': '12' })
        res.write('AAAA')
        const socket = res.socket
        setTimeout(() => socket.destroy(), 50)
        return
      }

      t.equal(req.headers.range, 'bytes=4-11')
      res.writeHead(412, { 'content-length': '8' })
      res.end('XXXXXXXX')
    })

    server.listen(0)
    await once(server, 'listening')

    const client = new Client(`http://localhost:${server.address().port}`)
    const agent = new RetryAgent(client, {
      throwOnError,
      maxRetries: 3,
      minTimeout: 10,
      maxTimeout: 10
    })

    context.after(async () => {
      await agent.close()
      server.close()
      await once(server, 'close')
    })

    await t.rejects(agent.stream({
      method: 'GET',
      path: '/'
    }, ({ statusCode }) => {
      t.equal(statusCode, 200)
      return new Writable({
        write (chunk, encoding, callback) {
          chunks.push(chunk)
          callback()
        }
      })
    }), {
      code: 'UND_ERR_REQ_RETRY',
      message: 'server does not support the range header and the payload was partially consumed'
    })

    t.equal(Buffer.concat(chunks).toString(), 'AAAA')
    await t.completed
  })
}
