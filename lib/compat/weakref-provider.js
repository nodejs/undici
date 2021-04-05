'use strict'

class CompatWeakRef {
  constructor (value) {
    this.value = value
  }

  deref () {
    return this.value.connected === 0 && this.value.size === 0
      ? undefined
      : this.value
  }
}

module.exports = {
  provide: () => global.WeakRef || CompatWeakRef
}
