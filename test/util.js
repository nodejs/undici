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
