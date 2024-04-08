'use strict'

const { strictEqual } = require('node:assert')
const { test, describe } = require('node:test')
const { isBlobLike } = require('../lib/core/util')

describe('isBlobLike', () => {
  test('buffer', () => {
    const buffer = Buffer.alloc(1)
    strictEqual(isBlobLike(buffer), false)
  })

  test('blob', () => {
    const blob = new Blob(['asd'], {
      type: 'application/json'
    })
    strictEqual(isBlobLike(blob), true)
  })

  test('file', () => {
    const file = new File(['asd'], 'file.txt', {
      type: 'text/plain'
    })
    strictEqual(isBlobLike(file), true)
  })

  test('blobLikeStream', () => {
    const blobLikeStream = {
      [Symbol.toStringTag]: 'Blob',
      stream: () => { }
    }
    strictEqual(isBlobLike(blobLikeStream), true)
  })

  test('fileLikeStream', () => {
    const fileLikeStream = {
      stream: () => { },
      [Symbol.toStringTag]: 'File'
    }
    strictEqual(isBlobLike(fileLikeStream), true)
  })

  test('fileLikeArrayBuffer', () => {
    const blobLikeArrayBuffer = {
      [Symbol.toStringTag]: 'Blob',
      arrayBuffer: () => { }
    }
    strictEqual(isBlobLike(blobLikeArrayBuffer), true)
  })

  test('blobLikeArrayBuffer', () => {
    const fileLikeArrayBuffer = {
      [Symbol.toStringTag]: 'File',
      arrayBuffer: () => { }
    }
    strictEqual(isBlobLike(fileLikeArrayBuffer), true)
  })

  test('string', () => {
    strictEqual(isBlobLike('Blob'), false)
  })

  test('null', () => {
    strictEqual(isBlobLike(null), false)
  })
})
