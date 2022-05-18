'use strict'

const { test } = require('tap')
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

test('Check response returned by static json() with init', async (t) => {
  for (const [init, expectedStatus, expectedStatusText, expectedContentType, expectedHeaders] of INIT_TESTS) {
    const response = Response.json('hello world', init)
    t.equal(response.type, 'default', "Response's type is default")
    t.equal(response.status, expectedStatus, "Response's status is " + expectedStatus)
    t.equal(response.statusText, expectedStatusText, "Response's statusText is " + JSON.stringify(expectedStatusText))
    t.equal(response.headers.get('content-type'), expectedContentType, "Response's content-type is " + expectedContentType)
    for (const key in expectedHeaders) {
      t.equal(response.headers.get(key), expectedHeaders[key], "Response's header " + key + ' is ' + JSON.stringify(expectedHeaders[key]))
    }

    const data = await response.json()
    t.equal(data, 'hello world', "Response's body is 'hello world'")
  }

  t.end()
})

test('Throws TypeError when calling static json() with an invalid status', (t) => {
  const nullBodyStatus = [204, 205, 304]

  for (const status of nullBodyStatus) {
    t.throws(() => {
      Response.json('hello world', { status })
    }, TypeError, `Throws TypeError when calling static json() with a status of ${status}`)
  }

  t.end()
})

test('Check static json() encodes JSON objects correctly', async (t) => {
  const response = Response.json({ foo: 'bar' })
  const data = await response.json()
  t.equal(typeof data, 'object', "Response's json body is an object")
  t.equal(data.foo, 'bar', "Response's json body is { foo: 'bar' }")

  t.end()
})

test('Check static json() throws when data is not encodable', (t) => {
  t.throws(() => {
    Response.json(Symbol('foo'))
  }, TypeError)

  t.end()
})

test('Check static json() throws when data is circular', (t) => {
  const a = { b: 1 }
  a.a = a

  t.throws(() => {
    Response.json(a)
  }, TypeError)

  t.end()
})

test('Check static json() propagates JSON serializer errors', (t) => {
  class CustomError extends Error {
    name = 'CustomError'
  }

  t.throws(() => {
    Response.json({ get foo () { throw new CustomError('bar') } })
  }, CustomError)

  t.end()
})

// note: these tests are not part of any WPTs
test('unserializable values', (t) => {
  t.throws(() => {
    Response.json(Symbol('symbol'))
  }, TypeError)

  t.throws(() => {
    Response.json(undefined)
  }, TypeError)

  t.throws(() => {
    Response.json()
  }, TypeError)

  t.end()
})

test('invalid init', (t) => {
  t.throws(() => {
    Response.json(null, 3)
  }, TypeError)

  t.end()
})
