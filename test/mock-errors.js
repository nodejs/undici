'use strict'

const { describe, test } = require('node:test')
const { mockErrors, errors } = require('..')

describe('MockNotMatchedError', () => {
  test('should implement an UndiciError', t => {
    t.plan(4)

    const mockError = new mockErrors.MockNotMatchedError()
    t.assert.ok(mockError instanceof errors.UndiciError)
    t.assert.deepStrictEqual(mockError.name, 'MockNotMatchedError')
    t.assert.deepStrictEqual(mockError.code, 'UND_MOCK_ERR_MOCK_NOT_MATCHED')
    t.assert.deepStrictEqual(mockError.message, 'The request does not match any registered mock dispatches')
  })

  test('should set a custom message', t => {
    t.plan(4)

    const mockError = new mockErrors.MockNotMatchedError('custom message')
    t.assert.ok(mockError instanceof errors.UndiciError)
    t.assert.deepStrictEqual(mockError.name, 'MockNotMatchedError')
    t.assert.deepStrictEqual(mockError.code, 'UND_MOCK_ERR_MOCK_NOT_MATCHED')
    t.assert.deepStrictEqual(mockError.message, 'custom message')
  })
})
