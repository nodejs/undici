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

class CompatFinalizer {
  constructor (finalizer) {
    this.finalizer = finalizer
  }

  register (dispatcher, key) {
    dispatcher.on('disconnect', () => {
      if (dispatcher.connected === 0 && dispatcher.size === 0) {
        this.finalizer(key)
      }
    })
  }
}

module.exports = function () {
  return {
    WeakRef: global.WeakRef || CompatWeakRef,
    FinalizationRegistry: global.FinalizationRegistry || CompatFinalizer
  }
}
