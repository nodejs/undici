'use strict'

const { TernarySearchTree } = require('../lib/core/tree')
const { test } = require('tap')

test('Ternary Search Tree', (t) => {
  t.plan(1)
  function generateAsciiString (length) {
    let result = ''
    const characters =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    const charactersLength = characters.length
    for (let i = 0; i < length; ++i) {
      result += characters[Math.floor(Math.random() * charactersLength)]
    }
    return result
  }
  const tst = new TernarySearchTree()

  const LENGTH = 5000

  /** @type {string[]} */
  const random = new Array(LENGTH)
  const randomBuffer = new Array(LENGTH)

  for (let i = 0; i < LENGTH; ++i) {
    const key = generateAsciiString((Math.random() * 100 + 5) | 0)
    const lowerCasedKey = random[i] = key.toLowerCase()
    randomBuffer[i] = Buffer.from(key)
    tst.insert(Buffer.from(lowerCasedKey), lowerCasedKey)
  }

  t.test('all', (t) => {
    for (let i = 0; i < LENGTH; ++i) {
      t.equal(tst.lookup(randomBuffer[i]), random[i])
    }
    t.end()
  })
})
