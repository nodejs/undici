'use strict'
const { createSecureServer } = require('node:http2')
const { once } = require('node:events')

const pem = require('https-pem')

const { test } = require('tap')
const { Client, fetch } = require('../..')

test('Issue#2415', async (t) => {
  const server = createSecureServer(pem)

  server.on('stream', async (stream, headers) => {
    stream.respond({
      ':status': 200
    })
    stream.end('test')
  })

  server.listen()
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  const response = await fetch(
    `https://localhost:${server.address().port}/`,
    // Needs to be passed to disable the reject unauthorized
    {
      method: 'GET',
      dispatcher: client
    }
  )

  await response.text()

  let canGetH2PseudoHeaders = false

  try {
    response.headers.get(':status')
    canGetH2PseudoHeaders = true
  } catch (e) {
    // do nothing
  }

  t.doesNotThrow(() => {
    if (canGetH2PseudoHeaders) {
      const status = response.headers.has(':status')
      if (status) {
        throw new TypeError(
          'It should not be possible to get the pseudo-headers `:status`.'
        )
      }
    }
  })

  t.end()
})
