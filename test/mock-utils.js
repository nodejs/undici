'use strict'

const { test } = require('tap')
const { deleteMockDispatch } = require('../lib/mock/mock-utils')

test('deleteMockDispatch - should do nothing if not able to find mock dispatch', (t) => {
  t.plan(1)

  const key = {
    url: 'url',
    path: 'path',
    method: 'method',
    body: 'body'
  }
  try {
    deleteMockDispatch([], key)
    t.ok('deleted mockDispatch')
  } catch (err) {
    t.fail(err.message)
  }
})
