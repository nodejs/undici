'use strict'

const { test } = require('tap')
const { createServer } = require('http')
const { fetch } = require('../..')

test('request with correct integrity checksum', (t) => {
  t.plan(1)

  const payload = {
    body: 'Hello world!',
    checksum: 'sha256-c0535e4be2b79ffd93291305436bf889314e4a3faec05ecffcbb7df31ad9e51a'
  }

  const server = createServer((req, res) => {
    res.end(payload.body)
  })

  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const body = await fetch(`http://localhost:${server.address().port}`, {
      integrity: payload.checksum
    })
    t.strictSame(payload.body, await body.text())
  })
})

test('request with wrong integrity checksum', (t) => {
  t.plan(1)

  const payload = {
    body: 'Hello world!',
    checksum: 'sha256-c0535e4be2b79ffd93291305436bf889314e4a3faec05ecffcbb7df31ad9e51b'
  }

  const server = createServer((req, res) => {
    res.end(payload.body)
  })

  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    fetch(`http://localhost:${server.address().port}`, {
      integrity: payload.checksum
    }).then(response => {
      t.fail('fetch did not fail')
    }).catch((err) => {
      t.equal(err.cause.message, 'integrity mismatch')
    })
  })
})
