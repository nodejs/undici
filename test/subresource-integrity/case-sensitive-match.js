'use strict'

const { test, describe } = require('node:test')

const { caseSensitiveMatch } = require('../../lib/web/subresource-integrity/subresource-integrity')

describe('caseSensitiveMatch', () => {
  test('identical strings', (t) => {
    const actualValue = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs'
    const expectedValue = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs'
    t.assert.ok(caseSensitiveMatch(actualValue, expectedValue))
  })

  test('identical strings, actualValue has one padding char', (t) => {
    const actualValue = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs='
    const expectedValue = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs'
    t.assert.ok(caseSensitiveMatch(actualValue, expectedValue))
  })

  test('identical strings, expectedValue has one padding char', (t) => {
    const actualValue = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs'
    const expectedValue = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs='
    t.assert.ok(caseSensitiveMatch(actualValue, expectedValue))
  })

  test('identical strings, expectedValue has two padding chars', (t) => {
    const actualValue = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs'
    const expectedValue = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs=='
    t.assert.ok(caseSensitiveMatch(actualValue, expectedValue))
  })

  test('identical strings, both have one padding char', (t) => {
    const actualValue = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs='
    const expectedValue = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs='
    t.assert.ok(caseSensitiveMatch(actualValue, expectedValue))
  })

  test('identical strings, both have two padding chars', (t) => {
    const actualValue = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs=='
    const expectedValue = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs=='
    t.assert.ok(caseSensitiveMatch(actualValue, expectedValue))
  })

  test('identical strings, expectedValue has invalid third padding char', (t) => {
    const actualValue = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs=='
    const expectedValue = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs==='
    t.assert.ok(caseSensitiveMatch(actualValue, expectedValue) === false)
  })

  test('expectedValue can be base64Url - match `_`', (t) => {
    const actualValue = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs'
    const expectedValue = 'ypeBEsobvcr6wjGzmiPcTaeG7_gUfE5yuYB3ha/uSLs'
    t.assert.ok(caseSensitiveMatch(actualValue, expectedValue))
  })

  test('expectedValue can be base64Url - match `+`', (t) => {
    const actualValue = 'ypeBEsobvcr6wjGzmiPcTaeG7+gUfE5yuYB3ha/uSLs'
    const expectedValue = 'ypeBEsobvcr6wjGzmiPcTaeG7-gUfE5yuYB3ha/uSLs'
    t.assert.ok(caseSensitiveMatch(actualValue, expectedValue))
  })

  test('should be case sensitive', (t) => {
    const actualValue = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs'
    const expectedValue = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLS'
    t.assert.ok(caseSensitiveMatch(actualValue, expectedValue) === false)
  })

  test('empty string should return true', (t) => {
    const actualValue = ''
    const expectedValue = ''
    t.assert.ok(caseSensitiveMatch(actualValue, expectedValue))
  })
})
