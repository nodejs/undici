'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { HeadersList, compareHeaderName } = require('../../lib/web/fetch/headers')

const characters = 'abcdefghijklmnopqrstuvwxyz0123456789'
const charactersLength = characters.length

function generateAsciiString (length) {
  let result = ''
  for (let i = 0; i < length; ++i) {
    result += characters[Math.floor(Math.random() * charactersLength)]
  }
  return result
}

const SORT_RUN = 4000

test('toSortedArray (fast-path)', () => {
  for (let i = 0; i < SORT_RUN; ++i) {
    const headersList = new HeadersList()
    for (let j = 0; j < 32; ++j) {
      headersList.append(generateAsciiString(4), generateAsciiString(4))
    }
    assert.deepStrictEqual(headersList.toSortedArray(), [...headersList].sort(compareHeaderName))
  }
})

test('toSortedArray (slow-path)', () => {
  for (let i = 0; i < SORT_RUN; ++i) {
    const headersList = new HeadersList()
    for (let j = 0; j < 64; ++j) {
      headersList.append(generateAsciiString(4), generateAsciiString(4))
    }
    assert.deepStrictEqual(headersList.toSortedArray(), [...headersList].sort(compareHeaderName))
  }
})
