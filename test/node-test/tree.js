'use strict'

const { TernarySearchTree, tree } = require('../../lib/core/tree')
const { wellknownHeaderNames, headerNameLowerCasedRecord } = require('../../lib/core/constants')
const { describe, test } = require('node:test')
const assert = require('node:assert')

describe('Ternary Search Tree', () => {
  test('The empty key cannot be added.', () => {
    assert.throws(() => new TernarySearchTree().insert(Buffer.from(''), ''))
    const tst = new TernarySearchTree()
    tst.insert(Buffer.from('a'), 'a')
    assert.throws(() => tst.insert(Buffer.from(''), ''))
  })

  test('looking up not inserted key returns null', () => {
    assert.throws(() => new TernarySearchTree().insert(Buffer.from(''), ''))
    const tst = new TernarySearchTree()
    tst.insert(Buffer.from('a'), 'a')
    assert.strictEqual(tst.lookup(Buffer.from('non-existant')), null)
  })

  test('duplicate key', () => {
    const tst = new TernarySearchTree()
    const key = Buffer.from('a')
    tst.insert(key, 'a')
    assert.strictEqual(tst.lookup(key), 'a')
    tst.insert(key, 'b')
    assert.strictEqual(tst.lookup(key), 'b')
  })

  test('tree', () => {
    for (let i = 0; i < wellknownHeaderNames.length; ++i) {
      const key = wellknownHeaderNames[i]
      assert.strictEqual(tree.lookup(Buffer.from(key)), headerNameLowerCasedRecord[key])
    }
  })

  test('fuzz', () => {
    const LENGTH = 2000
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    const charactersLength = characters.length

    function generateAsciiString (length) {
      let result = ''
      for (let i = 0; i < length; ++i) {
        result += characters[Math.floor(Math.random() * charactersLength)]
      }
      return result
    }
    const tst = new TernarySearchTree()

    /** @type {string[]} */
    const random = new Array(LENGTH)
    /** @type {Buffer[]} */
    const randomBuffer = new Array(LENGTH)

    for (let i = 0; i < LENGTH; ++i) {
      const key = generateAsciiString((Math.random() * 100 + 5) | 0)
      const lowerCasedKey = random[i] = key.toLowerCase()
      randomBuffer[i] = Buffer.from(key)
      tst.insert(Buffer.from(lowerCasedKey), lowerCasedKey)
    }

    for (let i = 0; i < LENGTH; ++i) {
      assert.strictEqual(tst.lookup(randomBuffer[i]), random[i])
    }
  })
})
