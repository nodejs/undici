'use strict'

let fastNow = Date.now()
let fastNowTimeout

const fastTimers = []

function onTimeout() {
  fastNow = Date.now()

  let len = fastTimers.length
  let idx = 0
  while (idx < len) {
    const timer = fastTimers[idx]
    if (!timer.expires) {
      if (idx !== len - 1) {
        fastTimers[idx] = fastTimers.pop()
      } else {
        fastTimers.pop()
      }
      len = fastTimers.length
    } else {
      if (fastNow >= timer.expires) {
        timer.expires = 0
        timer.callback(timer.opaque)
      }
      idx += 1
    }
  }

  if (fastTimers.length) {
    fastNowTimeout.refresh()
  }
}

function refreshTimeout () {
  if (fastNowTimeout && fastNowTimeout.refresh) {
    fastNowTimeout.refresh()
  } else {
    fastNowTimeout = setTimeout(onTimeout, 1e3)
    if (fastNowTimeout.unref) {
      fastNowTimeout.unref()
    }
  }
}

class Timeout {
  constructor(callback, delay, opaque) {
    this.callback = callback
    this.delay = delay
    this.opaque = opaque
    this.expires = fastNow + delay

    fastTimers.push(this)

    if (!fastNowTimeout || fastTimers.length === 1) {
      refreshTimeout()
    }
  }

  refresh () {
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


