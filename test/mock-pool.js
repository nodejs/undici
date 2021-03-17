'use strict'

const { test } = require('tap')
const { InvalidArgumentError } = require('../lib/core/errors')
const MockPool = require('../lib/mock/mock-pool')
const MockAgent = require('../lib/mock/mock-agent')

test('MockPool - constructor', t => {
  t.plan(2)

  t.test('fails if opts.agent does not implement `get` method', t => {
    t.plan(1)
    t.throw(() => new MockPool('http://localhost:9999', { agent: { get: 'not a function' } }), InvalidArgumentError)
  })

  t.test('sets agent', t => {
    t.plan(1)
    t.notThrow(() => new MockPool('http://localhost:9999', { agent: new MockAgent() }))
  })
})
