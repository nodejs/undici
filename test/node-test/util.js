'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { Stream } = require('node:stream')
const { EventEmitter } = require('node:events')

const util = require('../../lib/core/util')
const { headerNameLowerCasedRecord } = require('../../lib/core/constants')
const { InvalidArgumentError } = require('../../lib/core/errors')

test('isStream', () => {
  const stream = new Stream()
  assert.ok(util.isStream(stream))

  const buffer = Buffer.alloc(0)
  assert.ok(util.isStream(buffer) === false)

  const ee = new EventEmitter()
  assert.ok(util.isStream(ee) === false)
})

test('getServerName', () => {
  assert.equal(util.getServerName('1.1.1.1'), '')
  assert.equal(util.getServerName('1.1.1.1:443'), '')
  assert.equal(util.getServerName('example.com'), 'example.com')
  assert.equal(util.getServerName('example.com:80'), 'example.com')
  assert.equal(util.getServerName('[2606:4700:4700::1111]'), '')
  assert.equal(util.getServerName('[2606:4700:4700::1111]:443'), '')
})

test('assertRequestHandler', () => {
  assert.throws(() => util.assertRequestHandler(null), InvalidArgumentError, 'handler must be an object')
  assert.throws(() => util.assertRequestHandler({
    onConnect: null
  }), InvalidArgumentError, 'invalid onConnect method')
  assert.throws(() => util.assertRequestHandler({
    onConnect: () => {},
    onError: null
  }), InvalidArgumentError, 'invalid onError method')
  assert.throws(() => util.assertRequestHandler({
    onConnect: () => {},
    onError: () => {},
    onBodySent: null
  }), InvalidArgumentError, 'invalid onBodySent method')
  assert.throws(() => util.assertRequestHandler({
    onConnect: () => {},
    onError: () => {},
    onBodySent: () => {},
    onHeaders: null
  }), InvalidArgumentError, 'invalid onHeaders method')
  assert.throws(() => util.assertRequestHandler({
    onConnect: () => {},
    onError: () => {},
    onBodySent: () => {},
    onHeaders: () => {},
    onData: null
  }), InvalidArgumentError, 'invalid onData method')
  assert.throws(() => util.assertRequestHandler({
    onConnect: () => {},
    onError: () => {},
    onBodySent: () => {},
    onHeaders: () => {},
    onData: () => {},
    onComplete: null
  }), InvalidArgumentError, 'invalid onComplete method')
  assert.throws(() => util.assertRequestHandler({
    onConnect: () => {},
    onError: () => {},
    onBodySent: () => {},
    onUpgrade: 'null'
  }, 'CONNECT'), InvalidArgumentError, 'invalid onUpgrade method')
  assert.throws(() => util.assertRequestHandler({
    onConnect: () => {},
    onError: () => {},
    onBodySent: () => {},
    onUpgrade: 'null'
  }, 'CONNECT', () => {}), InvalidArgumentError, 'invalid onUpgrade method')
})

test('parseHeaders', () => {
  assert.deepEqual(util.parseHeaders(['key', 'value']), { key: 'value' })
  assert.deepEqual(util.parseHeaders([Buffer.from('key'), Buffer.from('value')]), { key: 'value' })
  assert.deepEqual(util.parseHeaders(['Key', 'Value']), { key: 'Value' })
  assert.deepEqual(util.parseHeaders(['Key', 'value', 'key', 'Value']), { key: ['value', 'Value'] })
  assert.deepEqual(util.parseHeaders(['key', ['value1', 'value2', 'value3']]), { key: ['value1', 'value2', 'value3'] })
  assert.deepEqual(util.parseHeaders([Buffer.from('key'), [Buffer.from('value1'), Buffer.from('value2'), Buffer.from('value3')]]), { key: ['value1', 'value2', 'value3'] })
})

test('parseRawHeaders', () => {
  assert.deepEqual(util.parseRawHeaders(['key', 'value', Buffer.from('key'), Buffer.from('value')]), ['key', 'value', 'key', 'value'])
  assert.deepEqual(util.parseRawHeaders(['content-length', 'value', 'content-disposition', 'form-data; name="fieldName"']), ['content-length', 'value', 'content-disposition', 'form-data; name="fieldName"'])
})

test('serializePathWithQuery', () => {
  const tests = [
    [{ id: BigInt(123456) }, 'id=123456'],
    [{ date: new Date() }, 'date='],
    [{ obj: { id: 1 } }, 'obj='],
    [{ params: ['a', 'b', 'c'] }, 'params=a&params=b&params=c'],
    [{ bool: true }, 'bool=true'],
    [{ number: 123456 }, 'number=123456'],
    [{ string: 'hello' }, 'string=hello'],
    [{ null: null }, 'null='],
    [{ void: undefined }, 'void='],
    [{ fn: function () {} }, 'fn='],
    [{}, '']
  ]

  const base = 'https://www.google.com'

  for (const [input, output] of tests) {
    const expected = `${base}${output ? `?${output}` : output}`
    assert.deepEqual(util.serializePathWithQuery(base, input), expected)
  }
})

test('headerNameLowerCasedRecord', () => {
  assert.ok(typeof headerNameLowerCasedRecord.hasOwnProperty !== 'function')
})
