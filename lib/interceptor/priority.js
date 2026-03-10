'use strict'

const DecoratorHandler = require('../handler/decorator-handler')

const PRIORITIES = {
  HIGHEST: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  LOWEST: 0
}

const VALID_PRIORITIES = new Set(Object.values(PRIORITIES))

class PriorityQueue {
  #queue = []
  #concurrency
  #maxQueue
  #running = 0

  constructor (concurrency = 1, maxQueue = 128) {
    this.#concurrency = concurrency
    this.#maxQueue = maxQueue
  }

  get length () {
    return this.#queue.length
  }

  acquire (callback, priority = 0) {
    if (this.#queue.length >= this.#maxQueue) {
      throw new Error(`Priority queue is full (max ${this.#maxQueue})`)
    }
    this.#queue.push({ callback, priority })
    this.#queue.sort((a, b) => b.priority - a.priority)
    this.#dispatch()
  }

  release () {
    this.#running--
    this.#dispatch()
  }

  #dispatch () {
    while (this.#running < this.#concurrency && this.#queue.length > 0) {
      const entry = this.#queue.shift()
      this.#running++
      entry.callback()
    }
  }
}

class PriorityHandler extends DecoratorHandler {
  #priorityQueue

  constructor (handler, priorityQueue) {
    super(handler)
    this.#priorityQueue = priorityQueue
  }

  onResponseEnd (controller, trailers) {
    this.#release()
    return super.onResponseEnd(controller, trailers)
  }

  onResponseError (controller, err) {
    this.#release()
    return super.onResponseError(controller, err)
  }

  #release () {
    if (this.#priorityQueue) {
      const priorityQueue = this.#priorityQueue
      this.#priorityQueue = null
      priorityQueue.release()
    }
  }
}

function createPriorityInterceptor ({ concurrency, maxQueue } = { concurrency: 1, maxQueue: 128 }) {
  return (dispatch) => {
    const queues = new Map()

    return function priorityInterceptor (opts, handler) {
      if (opts.priority == null || !opts.origin) {
        return dispatch(opts, handler)
      }

      if (!VALID_PRIORITIES.has(opts.priority)) {
        throw new Error(`Invalid priority ${opts.priority}. Must be one of: ${Object.keys(PRIORITIES).join(', ')} (${Object.values(PRIORITIES).join(', ')})`)
      }

      let queue = queues.get(opts.origin)
      if (!queue) {
        queue = new PriorityQueue(concurrency, maxQueue)
        queues.set(opts.origin, queue)
      }

      queue.acquire(() => {
        const priorityHandler = new PriorityHandler(handler, queue)
        try {
          dispatch(opts, priorityHandler)
        } catch (err) {
          priorityHandler.onResponseError(null, err)
        }
      }, opts.priority)
    }
  }
}

createPriorityInterceptor.PRIORITIES = PRIORITIES

module.exports = createPriorityInterceptor
