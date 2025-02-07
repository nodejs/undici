'use strict'

const {
  wellknownHeaderNames,
  headerNameLowerCasedRecord
} = require('./constants')

class TstNode {
  /** @type {any} */
  value = null
  /** @type {null | TstNode} */
  left = null
  /** @type {null | TstNode} */
  middle = null
  /** @type {null | TstNode} */
  right = null
  /** @type {number} */
  code
  /**
   * @param {string} key
   * @param {any} value
   * @param {number} index
   */
  constructor (key, value, index) {
    if (index === undefined || index >= key.length) {
      throw new TypeError('Unreachable')
    }
    const code = this.code = key.charCodeAt(index)
    // check code is ascii string
    if (code > 0x7F) {
      throw new TypeError('key must be ascii string')
    }
    if (key.length !== ++index) {
      this.middle = new TstNode(key, value, index)
    } else {
      this.value = value
    }
  }

  /**
   * @param {string} key
   * @param {any} value
   * @returns {void}
   */
  add (key, value) {
    const length = key.length
    if (length === 0) {
      throw new TypeError('Unreachable')
    }
    let index = 0
    /**
     * @type {TstNode}
     */
    let node = this
    while (true) {
      const code = key.charCodeAt(index)
      // check code is ascii string
      if (code > 0x7F) {
        throw new TypeError('key must be ascii string')
      }
      if (node.code === code) {
        if (length === ++index) {
          node.value = value
          break
        } else if (node.middle !== null) {
          node = node.middle
        } else {
          node.middle = new TstNode(key, value, index)
          break
        }
      } else if (node.code < code) {
        if (node.left !== null) {
          node = node.left
        } else {
          node.left = new TstNode(key, value, index)
          break
        }
      } else if (node.right !== null) {
        node = node.right
      } else {
        node.right = new TstNode(key, value, index)
        break
      }
    }
  }

  /**
   * @param {Uint8Array} key
   * @return {TstNode | null}
   */
  search (key) {
    const keylength = key.length
    let index = 0
    /**
     * @type {TstNode|null}
     */
    let node = this
    while (node !== null && index < keylength) {
      let code = key[index]
      // A-Z
      // First check if it is bigger than 0x5a.
      // Lowercase letters have higher char codes than uppercase ones.
      // Also we assume that headers will mostly contain lowercase characters.
      if (code <= 0x5a && code >= 0x41) {
        // Lowercase for uppercase.
        code |= 32
      }
      while (node !== null) {
        if (code === node.code) {
          if (keylength === ++index) {
            // Returns Node since it is the last key.
            return node
          }
          node = node.middle
          break
        }
        node = node.code < code ? node.left : node.right
      }
    }
    return null
  }
}

class TernarySearchTree {
  /** @type {TstNode | null} */
  node = null

  /**
   * @param {string} key
   * @param {any} value
   * @returns {void}
   * */
  insert (key, value) {
    if (this.node === null) {
      this.node = new TstNode(key, value, 0)
    } else {
      this.node.add(key, value)
    }
  }

  /**
   * @param {Uint8Array} key
   * @returns {any}
   */
  lookup (key) {
    return this.node?.search(key)?.value ?? null
  }
}

const tree = new TernarySearchTree()

// function shuffleArray (array) {
//   for (let i = array.length - 1; i > 0; i--) {
//     const j = Math.floor(Math.random() * (i + 1));
//     [array[i], array[j]] = [array[j], array[i]]
//   }
//   return array
// }
// const indexes = []
// wellknownHeaderNames.forEach((key, idx) => {
//   indexes.push(idx)
// })
// randomIndexOfWellknownHeaderNames = shuffleArray(indexes)

// Obtained by the above procedure
const randomIndexOfWellknownHeaderNames = [
  33, 61, 78, 55, 28, 2, 65, 68, 62, 74, 91, 71,
  31, 85, 58, 41, 43, 70, 34, 57, 66, 29, 3, 50,
  8, 39, 47, 54, 80, 64, 93, 26, 75, 63, 22, 20,
  90, 88, 17, 19, 92, 18, 1, 77, 67, 79, 6, 42,
  76, 23, 7, 84, 72, 89, 81, 37, 27, 69, 4, 87,
  94, 86, 15, 9, 56, 25, 38, 49, 12, 73, 24, 60,
  46, 11, 14, 83, 40, 52, 13, 21, 48, 30, 45, 10,
  53, 5, 59, 44, 35, 16, 36, 32, 0, 51, 82
]

if (randomIndexOfWellknownHeaderNames.length !== wellknownHeaderNames.length) {
  throw new TypeError('You need to regenerate randomIndexOfWellknownHeaderNames after ' +
    'updating wellknownHeaderNames')
}

for (const randomIndex of randomIndexOfWellknownHeaderNames) {
  const key = headerNameLowerCasedRecord[wellknownHeaderNames[randomIndex]]
  tree.insert(key, key)
}

module.exports = {
  TernarySearchTree,
  tree
}
