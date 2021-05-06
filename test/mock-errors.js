'use strict'

const { test } = require('tap')
const { mockErrors, errors } = require('..')

test('mockErrors', (t) => {
  t.plan(1)

  t.test('MockNotMatchedError', t => {
    t.plan(2)

    t.test('should implement an UndiciError', t => {
      t.plan(4)

      const mockError = new mockErrors.MockNotMatchedError()
      t.ok(mockError instanceof errors.UndiciError)
      t.same(mockError.name, 'MockNotMatchedError')
      t.same(mockError.code, 'UND_MOCK_ERR_MOCK_NOT_MATCHED')
      t.same(mockError.message, 'The request does not match any registered mock dispatches')
    })

    t.test('should set a custom message', t => {
      t.plan(4)

      const mockError = new mockErrors.MockNotMatchedError('custom message')
      t.ok(mockError instanceof errors.UndiciError)
      t.same(mockError.name, 'MockNotMatchedError')
      t.same(mockError.code, 'UND_MOCK_ERR_MOCK_NOT_MATCHED')
      t.same(mockError.message, 'custom message')
    })
  })
})
