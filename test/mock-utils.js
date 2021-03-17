'use strict'

const { test } = require('tap')
const { deleteMockDispatch, getMockDispatch } = require('../lib/mock/mock-utils')

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
    try {
      const result = getMockDispatch(dispatches, {
        path: 'path',
        method: 'method'
      })
      t.deepEqual(result, {
        path: 'path',
        method: 'method',
        consumed: false
      })
    } catch (error) {
      t.fail(error)
    }
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
    try {
      const result = getMockDispatch(dispatches, {
        path: 'path',
        method: 'method'
      })
      t.deepEqual(result, {
        path: 'path',
        method: 'method',
        consumed: false
      })
    } catch (error) {
      t.fail(error)
    }
  })

  t.test('it should return undefined is dispatch not found', (t) => {
    t.plan(1)
    const dispatches = [
      {
        path: 'path',
        method: 'method',
        consumed: false
      }
    ]
    try {
      const result = getMockDispatch(dispatches, {
        path: 'wrong',
        method: 'wrong'
      })
      t.strictEqual(result, undefined)
    } catch (error) {
      t.fail(error)
    }
  })
})
