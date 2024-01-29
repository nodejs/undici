'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { Response } = require('../../')

// https://github.com/web-platform-tests/wpt/pull/32825/

const APPLICATION_JSON = 'application/json'
const FOO_BAR = 'foo/bar'

const INIT_TESTS = [
  [undefined, 200, '', APPLICATION_JSON, {}],
  [{ status: 400 }, 400, '', APPLICATION_JSON, {}],
  [{ statusText: 'foo' }, 200, 'foo', APPLICATION_JSON, {}],
  [{ headers: {} }, 200, '', APPLICATION_JSON, {}],
  [{ headers: { 'content-type': FOO_BAR } }, 200, '', FOO_BAR, {}],
  [{ headers: { 'x-foo': 'bar' } }, 200, '', APPLICATION_JSON, { 'x-foo': 'bar' }]
]

test('Check response returned by static json() with init', async () => {
  for (const [init, expectedStatus, expectedStatusText, expectedContentType, expectedHeaders] of INIT_TESTS) {
    const response = Response.json('hello world', init)
    assert.strictEqual(response.type, 'default', "Response's type is default")
    assert.strictEqual(response.status, expectedStatus, "Response's status is " + expectedStatus)
    assert.strictEqual(response.statusText, expectedStatusText, "Response's statusText is " + JSON.stringify(expectedStatusText))
    assert.strictEqual(response.headers.get('content-type'), expectedContentType, "Response's content-type is " + expectedContentType)
    for (const key in expectedHeaders) {
      assert.strictEqual(response.headers.get(key), expectedHeaders[key], "Response's header " + key + ' is ' + JSON.stringify(expectedHeaders[key]))
    }

    const data = await response.json()
    assert.strictEqual(data, 'hello world', "Response's body is 'hello world'")
  }
})

test('Throws TypeError when calling static json() with an invalid status', () => {
  const nullBodyStatus = [204, 205, 304]

  for (const status of nullBodyStatus) {
    assert.throws(() => {
      Response.json('hello world', { status })
    }, TypeError, `Throws TypeError when calling static json() with a status of ${status}`)
  }
})

test('Check static json() encodes JSON objects correctly', async () => {
  const response = Response.json({ foo: 'bar' })
  const data = await response.json()
  assert.strictEqual(typeof data, 'object', "Response's json body is an object")
  assert.strictEqual(data.foo, 'bar', "Response's json body is { foo: 'bar' }")
})

test('Check static json() throws when data is not encodable', () => {
  assert.throws(() => {
    Response.json(Symbol('foo'))
  }, TypeError)
})

test('Check static json() throws when data is circular', () => {
  const a = { b: 1 }
  a.a = a

  assert.throws(() => {
    Response.json(a)
  }, TypeError)
})

test('Check static json() propagates JSON serializer errors', () => {
  class CustomError extends Error {
    name = 'CustomError'
  }

  assert.throws(() => {
    Response.json({ get foo () { throw new CustomError('bar') } })
  }, CustomError)
})

// note: these tests are not part of any WPTs
test('unserializable values', () => {
  assert.throws(() => {
    Response.json(Symbol('symbol'))
  }, TypeError)

  assert.throws(() => {
    Response.json(undefined)
  }, TypeError)

  assert.throws(() => {
    Response.json()
  }, TypeError)
})

test('invalid init', () => {
  assert.throws(() => {
    Response.json(null, 3)
  }, TypeError)
})
