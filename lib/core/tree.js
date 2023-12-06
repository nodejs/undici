const { wellknownHeaderNames } = require('./constants')

class Tree {
  #node
  constructor () {
    this.#node = {}
  }

  /**
   * @param {string} value
   */
  insert (value) {
    const target = Buffer.from((value = value.toLowerCase()))
    let node = this.#node
    for (let i = 0; i < target.length; ++i) {
      const key = target[i]
      node[key] ??= {}
      if (key >= 0x61 && key <= 0x7a) {
        node[key & ~32] ??= node[key]
      }
      node = node[key]
    }
    node.value = value
  }

  /**
   * @param {Uint8Array} buffer
   * @returns {string | null}
   */
  lookup (buffer) {
    const length = buffer.length
    let node = this.#node
    for (let i = 0; i < length; ++i) {
      const key = buffer[i]
      if (!(key in node) || node === undefined) return null
      node = node[key]
    }
    return node === undefined ? null : node.value
  }
}

const tree = new Tree()

for (let i = 0; i < wellknownHeaderNames.length; ++i) {
  tree.insert(wellknownHeaderNames[i])
}

module.exports = {
  Tree,
  tree
}
