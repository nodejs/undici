'use strict'

const { createServer } = require('node:http')
const { describe, test, after } = require('node:test')
const { fetch } = require('../..')
const { once } = require('node:events')

describe('https://github.com/nodejs/undici/issues/3616', () => {
  const cases = [
    'x-gzip',
    'gzip',
    'deflate',
    'br'
  ]

  for (const encoding of cases) {
    test(encoding, async t => {
      t.plan(2)
      const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
        res.writeHead(200, {
          'Content-Length': '0',
          Connection: 'close',
          'Content-Encoding': encoding
        })
        res.end()
      })

      after(() => {
        server.close()
      })

      server.listen(0)

      await once(server, 'listening')
      const result = await fetch(`http://localhost:${server.address().port}/`)

      t.assert.ok(result.body.getReader())

      process.on('uncaughtException', (reason) => {
        t.assert.fail('Uncaught Exception:', reason, encoding)
      })

      await new Promise(resolve => setTimeout(resolve, 100))
      t.assert.ok(true)
    })
  }
})
