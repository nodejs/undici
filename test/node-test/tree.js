'use strict'

const { TernarySearchTree, tree } = require('../../lib/core/tree')
const { wellknownHeaderNames, headerNameLowerCasedRecord } = require('../../lib/core/constants')
const { describe, test } = require('node:test')
const assert = require('node:assert')

describe('Ternary Search Tree', () => {
  test('The empty key cannot be added.', () => {
    assert.throws(() => new TernarySearchTree().insert('', ''))
    const tst = new TernarySearchTree()
    tst.insert('a', 'a')
    assert.throws(() => tst.insert('', ''))
  })

  test('looking up not inserted key returns null', () => {
    const tst = new TernarySearchTree()
    tst.insert('a', 'a')
    assert.strictEqual(tst.lookup(Buffer.from('non-existent')), null)
  })

  test('not ascii string', () => {
    assert.throws(() => new TernarySearchTree().insert('\x80', 'a'))
    const tst = new TernarySearchTree()
    tst.insert('a', 'a')
    // throw on TstNode
    assert.throws(() => tst.insert('\x80', 'a'))
  })

  test('duplicate key', () => {
    const tst = new TernarySearchTree()
    const key = 'a'
    const lookupKey = Buffer.from(key)
    tst.insert(key, 'a')
    assert.strictEqual(tst.lookup(lookupKey), 'a')
    tst.insert(key, 'b')
    assert.strictEqual(tst.lookup(lookupKey), 'b')
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
      tst.insert(lowerCasedKey, lowerCasedKey)
    }

    for (let i = 0; i < LENGTH; ++i) {
      assert.strictEqual(tst.lookup(randomBuffer[i]), random[i])
    }
  })
})
