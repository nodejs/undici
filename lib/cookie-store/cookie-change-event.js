'use strict'

const kChanged = Symbol('CookieChangeEvent changed')
const kDeleted = Symbol('CookieChangeEvent deleted')

// https://wicg.github.io/cookie-store/#CookieChangeEvent
class CookieChangeEvent extends Event {
  /**
   * @param {string} type
   * @param {EventInit} eventInitDict
   */
  constructor (type, eventInitDict = {}) {
    super(type, eventInitDict)

    this[kChanged] = []
    this[kDeleted] = []

    if (eventInitDict) {
      if (eventInitDict.changed) {
        this[kChanged].push(...eventInitDict.changed)
      }

      if (eventInitDict.deleted) {
        this[kDeleted].push(...eventInitDict.deleted)
      }
    }

    Object.freeze(this[kChanged])
    Object.freeze(this[kDeleted])
  }

  get changed () {
    return this[kChanged]
  }

  get deleted () {
    return this[kDeleted]
  }
}

module.exports = {
  CookieChangeEvent
}
