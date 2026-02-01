'use strict'

const { createServer } = require('node:http')
const { test } = require('node:test')
const { once } = require('node:events')
const { fetch } = require('../..')

// https://github.com/nodejs/undici/issues/4789
test('transferred buffers and extractBody works', { skip: !ArrayBuffer.prototype.transfer }, async (t) => {
  const server = createServer((req, res) => {
    if (req.url === '/') {
      res.writeHead(307, undefined, {
        location: '/test'
      })
      res.end()
      return
    }

    req.pipe(res).on('end', res.end.bind(res))
  }).listen(0)

  t.after(server.close.bind(server))
  await once(server, 'listening')

  {
    const response = await fetch('http://localhost:3000', {
      method: 'POST',
      body: new TextEncoder().encode('test')
    })

    t.assert.strictEqual(await response.text(), 'test')
  }

  {
    const response = await fetch('http://localhost:3000', {
      method: 'POST',
      body: Buffer.from('test')
    })

    t.assert.strictEqual(await response.text(), 'test')
  }

  {
    const buffer = new TextEncoder().encode('test')
    buffer.buffer.transfer()

    const response = await fetch('http://localhost:3000', {
      method: 'POST',
      body: buffer
    })

    // https://webidl.spec.whatwg.org/#dfn-get-buffer-source-copy
    // "If IsDetachedBuffer(jsArrayBuffer) is true, then return the empty byte sequence."
    t.assert.strictEqual(await response.text(), '')
  }
})
