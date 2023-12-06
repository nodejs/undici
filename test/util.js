'use strict'

const { test } = require('tap')
const { Stream } = require('stream')
const { EventEmitter } = require('events')

const util = require('../lib/core/util')
const { headerNameLowerCasedRecord } = require('../lib/core/constants')
const { InvalidArgumentError } = require('../lib/core/errors')

test('isStream', (t) => {
  t.plan(3)

  const stream = new Stream()
  t.ok(util.isStream(stream))

  const buffer = Buffer.alloc(0)
  t.notOk(util.isStream(buffer))

  const ee = new EventEmitter()
  t.notOk(util.isStream(ee))
})

test('getServerName', (t) => {
  t.plan(6)
  t.equal(util.getServerName('1.1.1.1'), '')
  t.equal(util.getServerName('1.1.1.1:443'), '')
  t.equal(util.getServerName('example.com'), 'example.com')
  t.equal(util.getServerName('example.com:80'), 'example.com')
  t.equal(util.getServerName('[2606:4700:4700::1111]'), '')
  t.equal(util.getServerName('[2606:4700:4700::1111]:443'), '')
})

test('validateHandler', (t) => {
  t.plan(9)

  t.throws(() => util.validateHandler(null), InvalidArgumentError, 'handler must be an object')
  t.throws(() => util.validateHandler({
    onConnect: null
  }), InvalidArgumentError, 'invalid onConnect method')
  t.throws(() => util.validateHandler({
    onConnect: () => {},
    onError: null
  }), InvalidArgumentError, 'invalid onError method')
  t.throws(() => util.validateHandler({
    onConnect: () => {},
    onError: () => {},
    onBodySent: null
  }), InvalidArgumentError, 'invalid onBodySent method')
  t.throws(() => util.validateHandler({
    onConnect: () => {},
    onError: () => {},
    onBodySent: () => {},
    onHeaders: null
  }), InvalidArgumentError, 'invalid onHeaders method')
  t.throws(() => util.validateHandler({
    onConnect: () => {},
    onError: () => {},
    onBodySent: () => {},
    onHeaders: () => {},
    onData: null
  }), InvalidArgumentError, 'invalid onData method')
  t.throws(() => util.validateHandler({
    onConnect: () => {},
    onError: () => {},
    onBodySent: () => {},
    onHeaders: () => {},
    onData: () => {},
    onComplete: null
  }), InvalidArgumentError, 'invalid onComplete method')
  t.throws(() => util.validateHandler({
    onConnect: () => {},
    onError: () => {},
    onBodySent: () => {},
    onUpgrade: 'null'
  }, 'CONNECT'), InvalidArgumentError, 'invalid onUpgrade method')
  t.throws(() => util.validateHandler({
    onConnect: () => {},
    onError: () => {},
    onBodySent: () => {},
    onUpgrade: 'null'
  }, 'CONNECT', () => {}), InvalidArgumentError, 'invalid onUpgrade method')
})

test('parseHeaders', (t) => {
  t.plan(6)
  t.same(util.parseHeaders(['key', 'value'], false), { key: 'value' })
  t.same(util.parseHeaders([Buffer.from('key'), Buffer.from('value')], false), { key: 'value' })
  t.same(util.parseHeaders(['Key', 'Value'], false), { key: 'Value' })
  t.same(util.parseHeaders(['Key', 'value', 'key', 'Value'], false), { key: ['value', 'Value'] })
  t.same(util.parseHeaders(['key', ['value1', 'value2', 'value3']], false), { key: ['value1', 'value2', 'value3'] })
  t.same(util.parseHeaders([Buffer.from('key'), [Buffer.from('value1'), Buffer.from('value2'), Buffer.from('value3')]], false), { key: ['value1', 'value2', 'value3'] })
})

test('parseHeaders allowUnsafe', (t) => {
  t.plan(6)
  t.same(util.parseHeaders(['key', 'value'], true), { key: 'value' })
  t.same(util.parseHeaders([Buffer.from('key'), Buffer.from('value')], true), { key: 'value' })
  t.same(util.parseHeaders(['Key', 'Value'], true), { key: 'Value' })
  t.same(util.parseHeaders(['Key', 'value', 'key', 'Value'], true), { key: ['value', 'Value'] })
  t.same(util.parseHeaders(['key', ['value1', 'value2', 'value3']], true), { key: ['value1', 'value2', 'value3'] })
  t.same(util.parseHeaders([Buffer.from('key'), [Buffer.from('value1'), Buffer.from('value2'), Buffer.from('value3')]], true), { key: ['value1', 'value2', 'value3'] })
})

test('parseRawHeaders', (t) => {
  t.plan(1)
  t.same(util.parseRawHeaders(['key', 'value', Buffer.from('key'), Buffer.from('value')]), ['key', 'value', 'key', 'value'])
})

test('buildURL', (t) => {
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
    t.equal(util.buildURL(base, input), expected)
  }

  t.end()
})

test('headerNameLowerCasedRecord', (t) => {
  t.plan(1)
  t.ok(typeof headerNameLowerCasedRecord.hasOwnProperty !== 'function')
})
