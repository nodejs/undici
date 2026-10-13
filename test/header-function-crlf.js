'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { Client, errors } = require('..')

function makeInjectingFn (payload) {
  const fn = function () {}
  fn.toString = () => payload
  return fn
}

function makeToPrimitiveFn (payload) {
  const fn = function () {}
  fn[Symbol.toPrimitive] = () => payload
  return fn
}

test('rejects function header value with CRLF via toString', async (t) => {
  t = tspl(t, { plan: 1 })

  const client = new Client('http://localhost:8080')
  after(() => client.destroy())

  t.rejects(client.request({
    path: '/',
    method: 'GET',
    headers: {
      'x-safe': makeInjectingFn('legit\r\ntransfer-encoding: chunked')
    }
  }), new errors.InvalidArgumentError('invalid x-safe header'))

  await t.completed
})

test('rejects function header value with CRLF via Symbol.toPrimitive', async (t) => {
  t = tspl(t, { plan: 1 })

  const client = new Client('http://localhost:8080')
  after(() => client.destroy())

  t.rejects(client.request({
    path: '/',
    method: 'GET',
    headers: {
      'x-safe': makeToPrimitiveFn('legit\r\nx-injected: yes')
    }
  }), new errors.InvalidArgumentError('invalid x-safe header'))

  await t.completed
})

test('rejects function header value in array element with CRLF via toString', async (t) => {
  t = tspl(t, { plan: 1 })

  const client = new Client('http://localhost:8080')
  after(() => client.destroy())

  t.rejects(client.request({
    path: '/',
    method: 'GET',
    headers: {
      'x-safe': [makeInjectingFn('legit\r\nx-injected: via-array')]
    }
  }), new errors.InvalidArgumentError('invalid x-safe header'))

  await t.completed
})

test('rejects function header value in array element with CRLF via Symbol.toPrimitive', async (t) => {
  t = tspl(t, { plan: 1 })

  const client = new Client('http://localhost:8080')
  after(() => client.destroy())

  t.rejects(client.request({
    path: '/',
    method: 'GET',
    headers: {
      'x-safe': [makeToPrimitiveFn('legit\r\nx-injected: via-array-primitive')]
    }
  }), new errors.InvalidArgumentError('invalid x-safe header'))

  await t.completed
})

test('still accepts number and boolean header values', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.strictEqual(req.headers['x-num'], '123')
    t.strictEqual(req.headers['x-bool'], 'true')
    res.end('ok')
  })
  after(() => server.close())

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`http://localhost:${server.address().port}`)
  after(() => client.close())

  const { body } = await client.request({
    path: '/',
    method: 'GET',
    headers: {
      'x-num': 123,
      'x-bool': true
    }
  })
  await body.dump()

  await t.completed
})
