'use strict'

const { test, describe } = require('node:test')

const { getStrongestMetadata } = require('../../lib/web/subresource-integrity/subresource-integrity')

describe('getStrongestMetadata', () => {
  test('should return strongest sha512 /1', (t) => {
    const result = getStrongestMetadata([
      { alg: 'sha256', val: 'sha256-abc' },
      { alg: 'sha384', val: 'sha384-def' },
      { alg: 'sha512', val: 'sha512-ghi' }
    ])
    t.assert.deepEqual(result, [
      { alg: 'sha512', val: 'sha512-ghi' }
    ])
  })

  test('should return strongest sha512 /2', (t) => {
    const result = getStrongestMetadata([
      { alg: 'sha512', val: 'sha512-ghi' },
      { alg: 'sha256', val: 'sha256-abc' },
      { alg: 'sha384', val: 'sha384-def' }
    ])
    t.assert.deepEqual(result, [
      { alg: 'sha512', val: 'sha512-ghi' }
    ])
  })

  test('should return strongest sha384', (t) => {
    const result = getStrongestMetadata([
      { alg: 'sha256', val: 'sha256-abc' },
      { alg: 'sha384', val: 'sha384-def' }
    ])
    t.assert.deepEqual(result, [
      { alg: 'sha384', val: 'sha384-def' }
    ])
  })

  test('should return both strongest sha384', (t) => {
    const result = getStrongestMetadata([
      { alg: 'sha384', val: 'sha384-abc' },
      { alg: 'sha256', val: 'sha256-def' },
      { alg: 'sha384', val: 'sha384-ghi' }
    ])
    t.assert.deepEqual(result, [
      { alg: 'sha384', val: 'sha384-abc' },
      { alg: 'sha384', val: 'sha384-ghi' }
    ])
  })

  test('should return multiple metadata with the same strength', (t) => {
    const result = getStrongestMetadata([
      { alg: 'sha256', val: 'sha256-abc' }
    ])
    t.assert.deepEqual(result, [
      { alg: 'sha256', val: 'sha256-abc' }
    ])
  })

  test('should return empty array when no metadata is provided', (t) => {
    const result = getStrongestMetadata([])
    t.assert.deepEqual(result, [])
  })

  test('should throw when invalid hash algorithm is provided', (t) => {
    t.assert.throws(() => getStrongestMetadata([
      { alg: 'sha1024', val: 'sha1024-xyz' }
    ]), {
      name: 'AssertionError',
      message: 'Invalid SRI hash algorithm token'
    })
  })
})
