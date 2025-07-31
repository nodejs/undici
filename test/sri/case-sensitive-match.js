'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert')

const { caseSensitiveMatch } = require('../../lib/web/sri/sri')

describe('caseSensitiveMatch', () => {
  test('identical strings', () => {
    const actualValue = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs'
    const expectedValue = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs'
    assert.ok(caseSensitiveMatch(actualValue, expectedValue))
  })

  test('identical strings, actualValue has one padding char', () => {
    const actualValue = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs='
    const expectedValue = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs'
    assert.ok(caseSensitiveMatch(actualValue, expectedValue))
  })

  test('identical strings, expectedValue has one padding char', () => {
    const actualValue = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs'
    const expectedValue = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs='
    assert.ok(caseSensitiveMatch(actualValue, expectedValue))
  })

  test('identical strings, expectedValue has two padding chars', () => {
    const actualValue = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs'
    const expectedValue = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs=='
    assert.ok(caseSensitiveMatch(actualValue, expectedValue))
  })

  test('identical strings, both have one padding char', () => {
    const actualValue = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs='
    const expectedValue = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs='
    assert.ok(caseSensitiveMatch(actualValue, expectedValue))
  })

  test('identical strings, both have two padding chars', () => {
    const actualValue = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs=='
    const expectedValue = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs=='
    assert.ok(caseSensitiveMatch(actualValue, expectedValue))
  })

  test('identical strings, expectedValue has invalid third padding char', () => {
    const actualValue = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs=='
    const expectedValue = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs==='
    assert.ok(caseSensitiveMatch(actualValue, expectedValue) === false)
  })

  test('expectedValue can be base64Url - match `_`', () => {
    const actualValue = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs'
    const expectedValue = 'ypeBEsobvcr6wjGzmiPcTaeG7_gUfE5yuYB3ha/uSLs'
    assert.ok(caseSensitiveMatch(actualValue, expectedValue))
  })

  test('expectedValue can be base64Url - match `+`', () => {
    const actualValue = 'ypeBEsobvcr6wjGzmiPcTaeG7+gUfE5yuYB3ha/uSLs'
    const expectedValue = 'ypeBEsobvcr6wjGzmiPcTaeG7-gUfE5yuYB3ha/uSLs'
    assert.ok(caseSensitiveMatch(actualValue, expectedValue))
  })

  test('should be case sensitive', () => {
    const actualValue = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs'
    const expectedValue = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLS'
    assert.ok(caseSensitiveMatch(actualValue, expectedValue) === false)
  })

  test('empty string should return true', () => {
    const actualValue = ''
    const expectedValue = ''
    assert.ok(caseSensitiveMatch(actualValue, expectedValue))
  })
})
