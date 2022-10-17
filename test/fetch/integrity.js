'use strict'

const { test } = require('tap')
const { createServer } = require('http')
const { createHash, getHashes } = require('crypto')
const { gzipSync } = require('zlib')
const { fetch, setGlobalDispatcher, Agent } = require('../..')
const { once } = require('events')

const supportedHashes = getHashes()

setGlobalDispatcher(new Agent({
  keepAliveTimeout: 1,
  keepAliveMaxTimeout: 1
}))

test('request with correct integrity checksum', (t) => {
  const body = 'Hello world!'
  const hash = createHash('sha256').update(body).digest('base64')

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
  const hash = createHash('sha256').update(body).digest('base64')

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

test('request with a totally incorrect integrity', async (t) => {
  const server = createServer((req, res) => {
    res.end()
  }).listen(0)

  t.teardown(server.close.bind(server))
  await once(server, 'listening')

  await t.resolves(fetch(`http://localhost:${server.address().port}`, {
    integrity: 'what-integrityisthis'
  }))
})

test('request with mixed in/valid integrities', async (t) => {
  const body = 'Hello world!'
  const hash = createHash('sha256').update(body).digest('base64')

  const server = createServer((req, res) => {
    res.end(body)
  }).listen(0)

  t.teardown(server.close.bind(server))
  await once(server, 'listening')

  await t.resolves(fetch(`http://localhost:${server.address().port}`, {
    integrity: `invalid-integrity sha256-${hash}`
  }))
})

test('request with sha384 hash', { skip: !supportedHashes.includes('sha384') }, async (t) => {
  const body = 'Hello world!'
  const hash = createHash('sha384').update(body).digest('base64')

  const server = createServer((req, res) => {
    res.end(body)
  }).listen(0)

  t.teardown(server.close.bind(server))
  await once(server, 'listening')

  // request should succeed
  await t.resolves(fetch(`http://localhost:${server.address().port}`, {
    integrity: `sha384-${hash}`
  }))

  // request should fail
  await t.rejects(fetch(`http://localhost:${server.address().port}`, {
    integrity: 'sha384-ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs='
  }))
})

test('request with sha512 hash', { skip: !supportedHashes.includes('sha512') }, async (t) => {
  const body = 'Hello world!'
  const hash = createHash('sha512').update(body).digest('base64')

  const server = createServer((req, res) => {
    res.end(body)
  }).listen(0)

  t.teardown(server.close.bind(server))
  await once(server, 'listening')

  // request should succeed
  await t.resolves(fetch(`http://localhost:${server.address().port}`, {
    integrity: `sha512-${hash}`
  }))

  // request should fail
  await t.rejects(fetch(`http://localhost:${server.address().port}`, {
    integrity: 'sha512-ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs='
  }))
})
