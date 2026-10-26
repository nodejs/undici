'use strict'

const FixedQueue = require('../../dispatcher/fixed-queue')

class WebSocketEventQueue {
  #queue = new FixedQueue()
  #drainScheduled = false
  #stopped = false

  enqueue (op) {
    if (this.#stopped) return
    this.#queue.push(op)
  }

  scheduleDrain () {
    if (this.#stopped) return
    if (this.#drainScheduled) return

    this.#drainScheduled = true
    setImmediate(() => this.#drain())
  }

  stop () {
    this.#stopped = true
  }

  #drain () {
    this.#drainScheduled = false

    if (this.#stopped) return

    while (!this.#queue.isEmpty()) {
      const op = this.#queue.shift()
      op()
    }
  }
}

module.exports = { WebSocketEventQueue }
