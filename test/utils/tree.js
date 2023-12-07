class Tree {
  #node = {}
  #depth = 0

  /**
   * @param {Uint8Array} key
   * @param {any} value
   */
  insert (key, value) {
    const length = key.length
    let node = this.#node
    for (let i = 0; i < length; ++i) {
      const t = key[i]
      node[t] ??= {}
      // a-z
      if (t >= 0x61 && t <= 0x7a) {
        // Uppercase letters preserve references to lowercase ones.
        node[t & ~32] ??= node[t]
      }
      node = node[t]
    }
    node.value = value
    if (length > this.#depth) {
      this.#depth = length
    }
  }

  /**
   * @param {Uint8Array} key
   * @returns {any}
   */
  lookup (key) {
    const length = key.length
    if (length > this.#depth) return null
    let node = this.#node
    for (let i = 0; i < length; ++i) {
      if ((node = node?.[key[i]]) === undefined) return null
    }
    return node?.value ?? null
  }
}
module.exports = { Tree }
