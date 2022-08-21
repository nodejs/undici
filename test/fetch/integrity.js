'use strict'

const { test } = require('tap')
const { createServer } = require('http')
const { createHash } = require('crypto')
const { gzipSync } = require('zlib')
const { fetch, setGlobalDispatcher, Agent } = require('../..')

setGlobalDispatcher(new Agent({
  keepAliveTimeout: 1,
  keepAliveMaxTimeout: 1
}))

test('request with correct integrity checksum', (t) => {
  const body = 'Hello world!'
  const hash = createHash('sha256').update(body).digest('hex')

  const server = createServer((req, res) => {
    res.end(body)
  })

  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const response = await fetch(`http://localhost:${server.address().port}`, {
      integrity: `sha256-${hash}`
    })
    t.strictSame(body, await response.text())
    t.end()
  })
})

test('request with wrong integrity checksum', (t) => {
  const body = 'Hello world!'
  const hash = 'c0535e4be2b79ffd93291305436bf889314e4a3faec05ecffcbb7df31ad9e51b'

  const server = createServer((req, res) => {
    res.end(body)
  })

  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    fetch(`http://localhost:${server.address().port}`, {
      integrity: `sha256-${hash}`
    }).then(response => {
      t.pass('request did not fail')
    }).catch((err) => {
      t.equal(err.cause.message, 'integrity mismatch')
    }).finally(() => {
      t.end()
    })
  })
})

test('request with integrity checksum on encoded body', (t) => {
  const body = 'Hello world!'
  const hash = createHash('sha256').update(body).digest('hex')

  const server = createServer((req, res) => {
    res.setHeader('content-encoding', 'gzip')
    res.end(gzipSync(body))
  })

  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const response = await fetch(`http://localhost:${server.address().port}`, {
      integrity: `sha256-${hash}`
    })
    t.strictSame(body, await response.text())
    t.end()
  })
})
