'use strict'

const { test } = require('node:test')
const { createServer } = require('node:http')
const { Client } = require('../../')
const { tspl } = require('@matteo.collina/tspl')

test('validations', async t => {
  let client
  const p = tspl(t, { plan: 10 })

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
    p.fail('server should never be called')
  })

  t.after(() => {
    server.close()
    client.close()
  })

  server.listen(0, async () => {
    const url = `http://localhost:${server.address().port}`
    client = new Client(url)

    await t.test('path', () => {
      client.request({ path: null, method: 'GET' }, (err, res) => {
        p.equal(err.code, 'UND_ERR_INVALID_ARG')
        p.equal(err.message, 'path must be a string')
      })

      client.request({ path: 'aaa', method: 'GET' }, (err, res) => {
        p.equal(err.code, 'UND_ERR_INVALID_ARG')
        p.equal(err.message, 'path must be an absolute URL or start with a slash')
      })
    })

    await t.test('method', () => {
      client.request({ path: '/', method: null }, (err, res) => {
        p.equal(err.code, 'UND_ERR_INVALID_ARG')
        p.equal(err.message, 'method must be a string')
      })
    })

    await t.test('body', () => {
      client.request({ path: '/', method: 'POST', body: 42 }, (err, res) => {
        p.equal(err.code, 'UND_ERR_INVALID_ARG')
        p.equal(err.message, 'body must be a string, a Buffer, a Readable stream, an iterable, or an async iterable')
      })

      client.request({ path: '/', method: 'POST', body: { hello: 'world' } }, (err, res) => {
        p.equal(err.code, 'UND_ERR_INVALID_ARG')
        p.equal(err.message, 'body must be a string, a Buffer, a Readable stream, an iterable, or an async iterable')
      })
    })
  })

  await p.completed
})
