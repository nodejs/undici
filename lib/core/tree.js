const { wellknownHeaderNames } = require('./constants')

class Tree {
  #node
  /** @type {number} */
  #depth
  constructor () {
    this.#node = {}
    this.#depth = 0
  }

  /**
   * @param {string} value
   */
  insert (value) {
    const target = Buffer.from((value = value.toLowerCase()))
    const length = target.length
    let node = this.#node
    for (let i = 0; i < length; ++i) {
      const key = target[i]
      node[key] ??= {}
      if (key >= 0x61 && key <= 0x7a) {
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
   * @param {Uint8Array} buffer
   * @returns {string | null}
   */
  lookup (buffer) {
    const length = buffer.length
    if (length > this.#depth) return null
    let node = this.#node
    for (let i = 0; i < length; ++i) {
      if ((node = node?.[buffer[i]]) === undefined) return null
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
