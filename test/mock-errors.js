'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { describe, test } = require('node:test')
const { mockErrors, errors } = require('..')

describe('MockNotMatchedError', () => {
  test('should implement an UndiciError', t => {
    t = tspl(t, { plan: 4 })

    const mockError = new mockErrors.MockNotMatchedError()
    t.ok(mockError instanceof errors.UndiciError)
    t.deepStrictEqual(mockError.name, 'MockNotMatchedError')
    t.deepStrictEqual(mockError.code, 'UND_MOCK_ERR_MOCK_NOT_MATCHED')
    t.deepStrictEqual(mockError.message, 'The request does not match any registered mock dispatches')
  })

  test('should set a custom message', t => {
    t = tspl(t, { plan: 4 })

    const mockError = new mockErrors.MockNotMatchedError('custom message')
    t.ok(mockError instanceof errors.UndiciError)
    t.deepStrictEqual(mockError.name, 'MockNotMatchedError')
    t.deepStrictEqual(mockError.code, 'UND_MOCK_ERR_MOCK_NOT_MATCHED')
    t.deepStrictEqual(mockError.message, 'custom message')
  })
})
