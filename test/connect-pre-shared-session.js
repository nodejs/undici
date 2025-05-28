'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after, mock } = require('node:test')
const { Client } = require('..')
const { createServer } = require('node:https')
const pem = require('https-pem')
const tls = require('node:tls')

test('custom session passed to client will be used in tls connect call', async (t) => {
  t = tspl(t, { plan: 4 })

  const mockConnect = mock.method(tls, 'connect')

  const server = createServer(pem, (req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  after(() => server.close())

  server.listen(0, async () => {
    const session = Buffer.from('test-session')

    const client = new Client(`https://localhost:${server.address().port}`, {
      connect: {
        rejectUnauthorized: false,
        session
      }
    })
    after(() => client.close())

    const { statusCode, headers, body } = await client.request({
      path: '/',
      method: 'GET'
    })

    t.strictEqual(statusCode, 200)
    t.strictEqual(headers['content-type'], 'text/plain')

    const responseText = await body.text()
    t.strictEqual('hello', responseText)

    const connectSession = mockConnect.mock.calls[0].arguments[0].session
    t.strictEqual(connectSession, session)
  })

  await t.completed
})
