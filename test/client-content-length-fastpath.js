'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after, describe } = require('node:test')
const net = require('node:net')
const { Client, errors } = require('..')
const { createServer } = require('node:http')

// Exercises the content-length body fast path in lib/dispatcher/client-h1.js:
// once the headers of a fixed-length response are parsed, body bytes are
// delivered without going through llhttp. These tests pin down the framing
// edge cases the fast path owns: message boundaries shared with pipelined
// responses, backpressure pauses, truncation and keep-alive reuse.

describe('content-length body fast path', () => {
  test('large fixed-length body split across many packets', async (t) => {
    t = tspl(t, { plan: 3 })

    const body = Buffer.alloc(256 * 1024, 'x')
    const server = createServer((req, res) => {
      res.writeHead(200, { 'content-length': `${body.length}` })
      res.end(body)
    })
    after(() => {
      server.closeAllConnections?.()
      server.close()
    })

    server.listen(0, async () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      after(() => client.close())

      const { statusCode, body: stream } = await client.request({ path: '/', method: 'GET' })
      const buf = Buffer.from(await stream.arrayBuffer())
      t.strictEqual(statusCode, 200)
      t.strictEqual(buf.length, body.length)
      t.strictEqual(buf.equals(body), true)
    })

    await t.completed
  })

  test('keep-alive reuse after fast path completion', async (t) => {
    t = tspl(t, { plan: 10 })

    const body = Buffer.alloc(128 * 1024, 'y')
    const server = createServer((req, res) => {
      res.writeHead(200, { 'content-length': `${body.length}` })
      res.end(body)
    })
    after(() => {
      server.closeAllConnections?.()
      server.close()
    })

    server.listen(0, async () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      after(() => client.close())

      client.on('disconnect', () => {
        if (!client.closed && !client.destroyed) {
          t.fail('connection must be reused')
        }
      })

      for (let i = 0; i < 5; i++) {
        const { statusCode, body: stream } = await client.request({ path: '/', method: 'GET' })
        const buf = Buffer.from(await stream.arrayBuffer())
        t.strictEqual(statusCode, 200)
        t.strictEqual(buf.equals(body), true)
      }
    })

    await t.completed
  })

  test('pipelined responses sharing packets, boundaries mid-chunk', async (t) => {
    t = tspl(t, { plan: 2 })

    const body1 = 'A'.repeat(64 * 1024)
    const body2 = 'B'.repeat(32 * 1024)
    const h1 = `HTTP/1.1 200 OK\r\ncontent-length: ${body1.length}\r\n\r\n`
    const h2 = `HTTP/1.1 200 OK\r\ncontent-length: ${body2.length}\r\n\r\n`

    const server = net.createServer((sock) => {
      sock.setNoDelay(true)
      let reqs = 0
      let sent1 = false
      let sent2 = false
      sock.on('data', (d) => {
        reqs += (d.toString().match(/GET/g) || []).length
        if (reqs >= 1 && !sent1) {
          sent1 = true
          // Headers and only the first slice of body1; the fast path
          // takes over for the rest.
          sock.write(h1 + body1.slice(0, 1000))
        }
        if (reqs >= 2 && !sent2) {
          sent2 = true
          // One glued packet: rest of body1, response 2 headers, first
          // slice of body2. The fast path must complete message 1 and
          // re-enter llhttp for message 2 headers.
          sock.write(body1.slice(1000) + h2 + body2.slice(0, 1000))
          setTimeout(() => sock.write(body2.slice(1000)), 20)
        }
      })
    })
    after(() => server.close())

    server.listen(0, async () => {
      const client = new Client(`http://localhost:${server.address().port}`, { pipelining: 2 })
      after(() => client.destroy())

      const [ta, tb] = await Promise.all([
        client.request({ path: '/1', method: 'GET' }).then(r => r.body.text()),
        client.request({ path: '/2', method: 'GET' }).then(r => r.body.text())
      ])
      t.strictEqual(ta === body1, true)
      t.strictEqual(tb === body2, true)
    })

    await t.completed
  })

  test('exact message boundary at end of packet', async (t) => {
    t = tspl(t, { plan: 2 })

    const body = 'Z'.repeat(16 * 1024)
    const header = `HTTP/1.1 200 OK\r\ncontent-length: ${body.length}\r\n\r\n`

    const server = net.createServer((sock) => {
      sock.setNoDelay(true)
      sock.once('data', () => {
        // Headers in one packet, body in a second packet ending exactly
        // at the message boundary.
        sock.write(header)
        setTimeout(() => sock.write(body), 10)
      })
    })
    after(() => server.close())

    server.listen(0, async () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      after(() => client.destroy())

      const { statusCode, body: stream } = await client.request({ path: '/', method: 'GET' })
      t.strictEqual(statusCode, 200)
      t.strictEqual(await stream.text(), body)
    })

    await t.completed
  })

  test('truncated fixed-length body errors on connection close', async (t) => {
    t = tspl(t, { plan: 1 })

    const body = 'T'.repeat(32 * 1024)

    const server = net.createServer((sock) => {
      sock.once('data', () => {
        sock.write(`HTTP/1.1 200 OK\r\ncontent-length: ${body.length}\r\nconnection: close\r\n\r\n`)
        // Send only part of the body, then close.
        sock.write(body.slice(0, 10000))
        setTimeout(() => sock.end(), 20)
      })
    })
    after(() => server.close())

    server.listen(0, async () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      after(() => client.destroy())

      try {
        const { body: stream } = await client.request({ path: '/', method: 'GET' })
        await stream.text()
        t.fail('must not resolve')
      } catch (err) {
        t.strictEqual(err.code, 'UND_ERR_RES_CONTENT_LENGTH_MISMATCH')
      }
    })

    await t.completed
  })

  test('truncated keep-alive fixed-length body errors on connection close', async (t) => {
    t = tspl(t, { plan: 1 })

    const body = 'K'.repeat(32 * 1024)

    const server = net.createServer((sock) => {
      sock.once('data', () => {
        sock.write(`HTTP/1.1 200 OK\r\ncontent-length: ${body.length}\r\n\r\n`)
        sock.write(body.slice(0, 10000))
        setTimeout(() => sock.end(), 20)
      })
    })
    after(() => server.close())

    server.listen(0, async () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      after(() => client.destroy())

      try {
        const { body: stream } = await client.request({ path: '/', method: 'GET' })
        await stream.text()
        t.fail('must not resolve')
      } catch (err) {
        t.ok(err)
      }
    })

    await t.completed
  })

  test('backpressure pause and resume mid-body', async (t) => {
    t = tspl(t, { plan: 2 })

    // Body larger than the default 64KB highWaterMark so that push()
    // returns false and the parser pauses while the fast path is active.
    const body = Buffer.alloc(512 * 1024, 'p')
    const server = createServer((req, res) => {
      res.writeHead(200, { 'content-length': `${body.length}` })
      res.end(body)
    })
    after(() => {
      server.closeAllConnections?.()
      server.close()
    })

    server.listen(0, async () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      after(() => client.close())

      const { statusCode, body: stream } = await client.request({ path: '/', method: 'GET' })
      t.strictEqual(statusCode, 200)

      // Consume slowly to force pauses.
      const chunks = []
      for await (const chunk of stream) {
        chunks.push(chunk)
        await new Promise(resolve => setImmediate(resolve))
      }
      t.strictEqual(Buffer.concat(chunks).equals(body), true)
    })

    await t.completed
  })

  test('maxResponseSize enforced on fast path body', async (t) => {
    t = tspl(t, { plan: 1 })

    const body = Buffer.alloc(256 * 1024, 'm')
    const server = createServer((req, res) => {
      res.writeHead(200, { 'content-length': `${body.length}` })
      res.end(body)
    })
    after(() => {
      server.closeAllConnections?.()
      server.close()
    })

    server.listen(0, async () => {
      const client = new Client(`http://localhost:${server.address().port}`, { maxResponseSize: 100 * 1024 })
      after(() => client.destroy())

      try {
        const { body: stream } = await client.request({ path: '/', method: 'GET' })
        await stream.text()
        t.fail('must not resolve')
      } catch (err) {
        t.strictEqual(err instanceof errors.ResponseExceededMaxSizeError, true)
      }
    })

    await t.completed
  })

  test('chunked transfer-encoding is not affected', async (t) => {
    t = tspl(t, { plan: 2 })

    const body = 'c'.repeat(128 * 1024)
    const server = createServer((req, res) => {
      // No content-length: Node uses chunked encoding.
      res.writeHead(200)
      res.write(body.slice(0, 60000))
      setTimeout(() => res.end(body.slice(60000)), 10)
    })
    after(() => {
      server.closeAllConnections?.()
      server.close()
    })

    server.listen(0, async () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      after(() => client.close())

      const { statusCode, body: stream } = await client.request({ path: '/', method: 'GET' })
      t.strictEqual(statusCode, 200)
      t.strictEqual(await stream.text(), body)
    })

    await t.completed
  })

  test('fast path does not activate for bodyless 304 with content-length', async (t) => {
    t = tspl(t, { plan: 1 })

    const server = net.createServer((sock) => {
      sock.once('data', () => {
        // llhttp treats 304 as bodyless even with content-length set, and
        // undici then rejects the length mismatch. If the fast path
        // activated here the client would hang waiting for body bytes
        // instead of erroring right away.
        sock.write('HTTP/1.1 304 Not Modified\r\ncontent-length: 1234\r\n\r\n')
      })
    })
    after(() => server.close())

    server.listen(0, async () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      after(() => client.destroy())

      try {
        const { body } = await client.request({ path: '/', method: 'GET' })
        await body.text()
        t.fail('must not resolve')
      } catch (err) {
        t.strictEqual(err.code, 'UND_ERR_RES_CONTENT_LENGTH_MISMATCH')
      }
    })

    await t.completed
  })

  test('headers larger than the slice size parse correctly', async (t) => {
    t = tspl(t, { plan: 3 })

    // Header block larger than HEADER_SLICE_SIZE (4096) to cover header
    // parsing spanning multiple slices.
    const bigValue = 'v'.repeat(3000)
    const body = 'H'.repeat(64 * 1024)
    const server = createServer((req, res) => {
      res.writeHead(200, {
        'content-length': `${body.length}`,
        'x-big-one': bigValue,
        'x-big-two': bigValue
      })
      res.end(body)
    })
    after(() => {
      server.closeAllConnections?.()
      server.close()
    })

    server.listen(0, async () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      after(() => client.close())

      const { statusCode, headers, body: stream } = await client.request({ path: '/', method: 'GET' })
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['x-big-two'], bigValue)
      t.strictEqual(await stream.text(), body)
    })

    await t.completed
  })

  test('bodies interleaved with 100-continue-free informational responses', async (t) => {
    t = tspl(t, { plan: 2 })

    const body = 'i'.repeat(20000)
    const server = net.createServer((sock) => {
      sock.once('data', () => {
        // 103 Early Hints, then the real fixed-length response.
        sock.write('HTTP/1.1 103 Early Hints\r\nlink: </style.css>; rel=preload\r\n\r\n')
        sock.write(`HTTP/1.1 200 OK\r\ncontent-length: ${body.length}\r\n\r\n`)
        setTimeout(() => sock.write(body), 10)
      })
    })
    after(() => server.close())

    server.listen(0, async () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      after(() => client.destroy())

      const { statusCode, body: stream } = await client.request({ path: '/', method: 'GET' })
      t.strictEqual(statusCode, 200)
      t.strictEqual(await stream.text(), body)
    })

    await t.completed
  })
})
