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

    if (timer.expires && fastNow >= timer.expires) {
      timer.expires = 0
      timer.callback(timer.opaque)
    }

    if (timer.expires === 0) {
      timer.destroyed = true
      if (idx !== len - 1) {
        fastTimers[idx] = fastTimers.pop()
      } else {
        fastTimers.pop()
      }
      len -= 1
    } else {
      idx += 1
    }
  }

  if (fastTimers.length) {
    refreshTimeout()
  }
}

function refreshTimeout () {
  if (fastNowTimeout && fastNowTimeout.refresh) {
    fastNowTimeout.refresh()
  } else {
    clearTimeout(fastNowTimeout)
    fastNowTimeout = setTimeout(onTimeout, 1e3)
    if (fastNowTimeout.unref) {
      fastNowTimeout.unref()
    }
  }
}

class Timeout {
  constructor (callback, delay, opaque) {
    this.callback = callback
    this.delay = delay
    this.opaque = opaque
    this.expires = fastNow + delay

    this.destroyed = false
    fastTimers.push(this)

    if (!fastNowTimeout || fastTimers.length === 1) {
      refreshTimeout()
    }
  }

  refresh () {
    if (this.destroyed) {
      this.destroyed = false
      fastTimers.push(this)
    }

    this.expires = fastNow + this.delay
  }

  clear () {
    this.expires = 0
  }
}

module.exports = {
  setTimeout (callback, delay, opaque) {
    return new Timeout(callback, delay, opaque)
  },
  clearTimeout (timeout) {
    if (timeout && timeout.clear) {
      timeout.clear()
    }
  }
}
