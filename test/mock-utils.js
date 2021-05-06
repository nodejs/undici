'use strict'

const { test } = require('tap')
const { MockNotMatchedError } = require('../lib/mock/mock-errors')
const { deleteMockDispatch, getMockDispatch } = require('../lib/mock/mock-utils')

test('deleteMockDispatch - should do nothing if not able to find mock dispatch', (t) => {
  t.plan(1)

  const key = {
    url: 'url',
    path: 'path',
    method: 'method',
    body: 'body'
  }

  t.doesNotThrow(() => deleteMockDispatch([], key))
})

test('getMockDispatch', (t) => {
  t.plan(3)

  t.test('it should find a mock dispatch', (t) => {
    t.plan(1)
    const dispatches = [
      {
        path: 'path',
        method: 'method',
        consumed: false
      }
    ]

    const result = getMockDispatch(dispatches, {
      path: 'path',
      method: 'method'
    })
    t.same(result, {
      path: 'path',
      method: 'method',
      consumed: false
    })
  })

  t.test('it should skip consumed dispatches', (t) => {
    t.plan(1)
    const dispatches = [
      {
        path: 'path',
        method: 'method',
        consumed: true
      },
      {
        path: 'path',
        method: 'method',
        consumed: false
      }
    ]

    const result = getMockDispatch(dispatches, {
      path: 'path',
      method: 'method'
    })
    t.same(result, {
      path: 'path',
      method: 'method',
      consumed: false
    })
  })

  t.test('it should throw if dispatch not found', (t) => {
    t.plan(1)
    const dispatches = [
      {
        path: 'path',
        method: 'method',
        consumed: false
      }
    ]

    t.throws(() => getMockDispatch(dispatches, {
      path: 'wrong',
      method: 'wrong'
    }), new MockNotMatchedError('Mock dispatch not matched for path \'wrong\''))
  })
})
