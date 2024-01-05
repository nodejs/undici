'use strict'

const { TernarySearchTree, tree } = require('../lib/core/tree')
const { wellknownHeaderNames, headerNameLowerCasedRecord } = require('../lib/core/constants')
const { test } = require('tap')

test('Ternary Search Tree', (t) => {
  t.plan(4)

  t.test('The empty key cannot be added.', (t) => {
    t.plan(2)
    t.throws(() => new TernarySearchTree().insert(Buffer.from(''), ''))
    const tst = new TernarySearchTree()
    tst.insert(Buffer.from('a'), 'a')
    t.throws(() => tst.insert(Buffer.from(''), ''))
  })

  t.test('duplicate key', (t) => {
    t.plan(2)
    const tst = new TernarySearchTree()
    const key = Buffer.from('a')
    tst.insert(key, 'a')
    t.equal(tst.lookup(key), 'a')
    tst.insert(key, 'b')
    t.equal(tst.lookup(key), 'b')
  })

  t.test('tree', (t) => {
    t.plan(wellknownHeaderNames.length)
    for (let i = 0; i < wellknownHeaderNames.length; ++i) {
      const key = wellknownHeaderNames[i]
      t.equal(tree.lookup(Buffer.from(key)), headerNameLowerCasedRecord[key])
    }
  })

  t.test('fuzz', (t) => {
    const LENGTH = 2000
    t.plan(LENGTH)
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
      t.equal(tst.lookup(randomBuffer[i]), random[i])
    }
  })
})
