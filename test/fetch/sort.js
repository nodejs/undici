'use strict'

const { describe, test } = require('node:test')
const assert = require('node:assert')
const { sort, heapSort, binaryInsertionSort, introSort } = require('../../lib/web/fetch/sort')

function generateRandomNumberArray (length) {
  const array = new Uint16Array(length)
  for (let i = 0; i < length; ++i) {
    array[i] = (65535 * Math.random()) | 0
  }
  return array
}

const compare = (a, b) => a - b

const SORT_RUN = 4000

const SORT_ELEMENT = 200

describe('sort', () => {
  const arrays = new Array(SORT_RUN)
  const expectedArrays = new Array(SORT_RUN)

  for (let i = 0; i < SORT_RUN; ++i) {
    const array = generateRandomNumberArray(SORT_ELEMENT)
    const expected = array.slice().sort(compare)
    arrays[i] = array
    expectedArrays[i] = expected
  }

  test('binary insertion sort', () => {
    for (let i = 0; i < SORT_RUN; ++i) {
      assert.deepStrictEqual(binaryInsertionSort(arrays[i].slice(), 0, SORT_ELEMENT, compare), expectedArrays[i])
    }
  })

  test('heap sort', () => {
    for (let i = 0; i < SORT_RUN; ++i) {
      assert.deepStrictEqual(heapSort(arrays[i].slice(), 0, SORT_ELEMENT, compare), expectedArrays[i])
    }
  })

  test('intro sort', () => {
    for (let i = 0; i < SORT_RUN; ++i) {
      assert.deepStrictEqual(introSort(arrays[i].slice(), 0, SORT_ELEMENT, compare), expectedArrays[i])
    }
  })

  test('sort', () => {
    for (let i = 0; i < SORT_RUN; ++i) {
      assert.deepStrictEqual(sort(arrays[i].slice(), compare), expectedArrays[i])
    }
  })
})

describe('sorted', () => {
  const arrays = new Array(SORT_RUN)
  const expectedArrays = new Array(SORT_RUN)

  for (let i = 0; i < SORT_RUN; ++i) {
    const array = generateRandomNumberArray(SORT_ELEMENT).sort(compare)
    arrays[i] = array
    expectedArrays[i] = array.slice()
  }

  test('binary insertion sort', () => {
    for (let i = 0; i < SORT_RUN; ++i) {
      assert.deepStrictEqual(binaryInsertionSort(arrays[i].slice(), 0, SORT_ELEMENT, compare), expectedArrays[i])
    }
  })

  test('heap sort', () => {
    for (let i = 0; i < SORT_RUN; ++i) {
      assert.deepStrictEqual(heapSort(arrays[i].slice(), 0, SORT_ELEMENT, compare), expectedArrays[i])
    }
  })

  test('intro sort', () => {
    for (let i = 0; i < SORT_RUN; ++i) {
      assert.deepStrictEqual(introSort(arrays[i].slice(), 0, SORT_ELEMENT, compare), expectedArrays[i])
    }
  })

  test('sort', () => {
    for (let i = 0; i < SORT_RUN; ++i) {
      assert.deepStrictEqual(sort(arrays[i].slice(), compare), expectedArrays[i])
    }
  })
})
