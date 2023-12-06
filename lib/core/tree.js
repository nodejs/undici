const { wellknownHeaderNames } = require('./constants')

class Tree {
  #node = {}
  #depth = 0

  /**
   * Lowercases key and inserts its value into the node.
   * @param {string} value
   */
  insert (value) {
    const target = Buffer.from((value = value.toLowerCase()))
    const length = target.length
    let node = this.#node
    for (let i = 0; i < length; ++i) {
      const key = target[i]
      node[key] ??= {}
      // a-z
      if (key >= 0x61 && key <= 0x7a) {
        // Uppercase letters preserve references to lowercase ones.
        node[key & ~32] ??= node[key]
      }
      node = node[key]
    }
    node[256] = value
    if (length > this.#depth) {
      this.#depth = length
    }
  }

  /**
   * Retrieves values from a node.
   * @param {Uint8Array} key Node Key
   * @returns {string | null} Value
   */
  lookup (key) {
    const length = key.length
    if (length > this.#depth) return null
    let node = this.#node
    for (let i = 0; i < length; ++i) {
      if ((node = node?.[key[i]]) === undefined) return null
    }
    return node?.[256] ?? null
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
