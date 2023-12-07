const { Tree } = require('./utils/tree')
const { TernarySearchTree } = require('../lib/core/tree')
const assert = require('assert')
const { test } = require('tap')

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

const tree = new Tree()
const tst = new TernarySearchTree()

/** @type {string[]} */
const random = new Array(10000)
  .fill(0)
  .map(() => generateAsciiString((Math.random() * 100 + 5) | 0))
const randomBuffer = random.map((c) => Buffer.from(c))

for (let i = 0; i < random.length; ++i) {
  const key = random[i]
  const lowerCasedKey = key.toLowerCase()
  const buffer = Buffer.from(lowerCasedKey)
  tree.insert(buffer, lowerCasedKey)
  tst.insert(buffer, lowerCasedKey)
}

test('all', (t) => {
  try {
    for (let i = 0; i < randomBuffer.length; ++i) {
      const a = tree.lookup(randomBuffer[i])
      const b = tst.lookup(randomBuffer[i])
      assert.equal(a, b)
    }
    t.pass()
  } catch (e) {
    t.fail(String(e))
  }
  t.end()
})
