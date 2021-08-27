'use strict'

const t = require('tap')
const { test } = t
const { Stream } = require('stream')
const { EventEmitter } = require('events')

const util = require('../lib/core/util')

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
