'use strict'

let fastNow = Date.now()
let fastNowTimeout

const fastTimers = []

function onTimeout () {
  fastNow = Date.now()

  let len = fastTimers.length
  let idx = 0
  while (idx < len) {
    const timer = fastTimers[idx]

    // no need to detect
    if (fastNow < timer.expires) {
      break
    }

    if (timer.expires && fastNow >= timer.expires) {
      removeTimeout(timer)
      timer.callback(timer.opaque, timer.type)
      len--
    }

    idx++
  }

  if (fastTimers.length > 0) {
    refreshTimeout()
  }
}

function refreshTimeout () {
  fastNow = Date.now()

  // get next timeout default delay
  let delay = 1e3
  if (fastTimers.length > 0) {
    delay = Math.min(fastTimers[0].delay, 1e3)
  }
  fastNowTimeout = setTimeout(onTimeout, Math.min(delay, 1e3))

  // execute unref
  if (fastNowTimeout.unref) {
    fastNowTimeout.unref()
  }
}

// sort by timeout's expires
function addTimeout (timeout) {
  const insertIndex = Math.max(fastTimers.findIndex(timer => timer.expires >= timeout.expires), 0)
  fastTimers.splice(insertIndex, 0, timeout)
}

function removeTimeout (timeout) {
  timeout.active = false
  const currentIndex = fastTimers.findIndex(timer => timer === timeout)
  fastTimers.splice(currentIndex, 1)
}

class Timeout {
  constructor (callback, delay, opaque, type) {
    this.callback = callback
    this.delay = delay
    this.opaque = opaque
    this.expires = Date.now() + delay
    this.active = false
    this.type = type

    this.refresh()
  }

  refresh () {
    if (!this.active) {
      this.active = true
      addTimeout(this)
      refreshTimeout()
    }

    this.expires = fastNow + this.delay
  }

  clear () {
    removeTimeout(this)
  }
}

module.exports = {
  setTimeout (callback, delay, opaque, type) {
    return new Timeout(callback, delay, opaque, type)
  },
  clearTimeout (timeout) {
    if (timeout && timeout.clear) {
      timeout.clear()
    }
  }
}
