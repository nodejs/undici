'use strict'

const { test, describe, afterEach, beforeEach } = require('node:test')
const { createServer } = require('node:http')
const { Client } = require('../../')
const { once } = require('node:events')

describe('validations', () => {
  let server
  let client

  afterEach(() => {
    server.close()
    client.close()
  })

  beforeEach(async () => {
    server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.setHeader('content-type', 'text/plain')
      res.end('hello')
    })
    await once(server.listen(0), 'listening')
    client = new Client(`http://localhost:${server.address().port}`)
  })

  test('path', (t, done) => {
    client.request({ path: null, method: 'GET' }, (err, res) => {
      t.assert.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
      t.assert.strictEqual(err.message, 'path must be a string')
      done()
    })
  })

  test('path', (t, done) => {
    client.request({ path: 'aaa', method: 'GET' }, (err, res) => {
      t.assert.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
      t.assert.strictEqual(err.message, 'path must be an absolute URL or start with a slash')
      done()
    })
  })

  test('method', (t, done) => {
    client.request({ path: '/', method: null }, (err, res) => {
      t.assert.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
      t.assert.strictEqual(err.message, 'method must be a string')
      done()
    })
  })

  test('body', (t, done) => {
    client.request({ path: '/', method: 'POST', body: 42 }, (err, res) => {
      t.assert.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
      t.assert.strictEqual(err.message, 'body must be a string, a Buffer, a Readable stream, an iterable, or an async iterable')
      done()
    })
  })

  test('body', (t, done) => {
    client.request({ path: '/', method: 'POST', body: { hello: 'world' } }, (err, res) => {
      t.assert.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
      t.assert.strictEqual(err.message, 'body must be a string, a Buffer, a Readable stream, an iterable, or an async iterable')
      done()
    })
  })
})
