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

  /** @type {string[]} */
  const random = new Array(5000)
    .fill(0)
    .map(() => generateAsciiString((Math.random() * 100 + 5) | 0))
  const randomBuffer = random.map((c) => Buffer.from(c))

  for (let i = 0; i < random.length; ++i) {
    const key = random[i] = random[i].toLowerCase()
    tst.insert(Buffer.from(key), key)
  }
  t.test('all', (t) => {
    for (let i = 0; i < randomBuffer.length; ++i) {
      t.equal(tst.lookup(randomBuffer[i]), random[i])
    }
    t.end()
  })
})
