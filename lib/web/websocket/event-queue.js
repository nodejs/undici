'use strict'

const FixedQueue = require('../../dispatcher/fixed-queue')

class WebSocketEventQueue {
  #queue = new FixedQueue()
  #drainScheduled = false

  enqueue (op) {
    this.#queue.push(op)
  }

  scheduleDrain () {
    if (this.#drainScheduled) return

    this.#drainScheduled = true
    setImmediate(() => this.#drain())
  }

  #drain () {
    this.#drainScheduled = false

    while (!this.#queue.isEmpty()) {
      const op = this.#queue.shift()
      op()
    }
  }
}

module.exports = { WebSocketEventQueue }
