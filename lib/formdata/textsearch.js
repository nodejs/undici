'use strict'

class TextSearch {
  /** @param {Buffer} pattern */
  constructor (pattern) {
    this.pattern = pattern

    this.back = 0
    this.lookedAt = 0
  }

  /**
   * @param {Buffer} chunk
   */
  write (chunk) {
    if (this.finished) {
      return true
    }

    for (const byte of chunk) {
      this.lookedAt++

      if (byte !== this.pattern[this.back]) {
        this.back = 0
      } else {
        if (++this.back === this.pattern.length) {
          return true
        }
      }
    }

    return this.back === this.pattern.length
  }

  reset () {
    this.back = 0
    this.lookedAt = 0
  }

  get finished () {
    return this.back === this.pattern.length
  }
}

module.exports = {
  TextSearch
}
