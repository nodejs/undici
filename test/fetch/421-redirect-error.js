'use strict'

const { once } = require('node:events')
const { createServer } = require('node:http')
const { test } = require('node:test')
const { fetch } = require('../..')

test('421 retry resends the full body when redirect is "error"', async (t) => {
  const expected = 'This is a 421 Misdirected Request response.'
  const received = []

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      received.push(body)
      res.statusCode = 421
      res.end(expected)
    })
  }).listen(0)

  t.after(server.close.bind(server))
  await once(server, 'listening')

  for (const body of [
    'hello',
    new Uint8Array(Buffer.from('helloworld', 'utf-8'))
  ]) {
    received.length = 0

    const response = await fetch(`http://localhost:${server.address().port}`, {
      method: 'POST',
      body,
      redirect: 'error'
    })

    t.assert.deepStrictEqual(response.status, 421)
    t.assert.deepStrictEqual(await response.text(), expected)

    const sent = Buffer.from(body).toString()
    t.assert.deepStrictEqual(received, [sent, sent])
  }
})
