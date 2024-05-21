'use strict'

const { WebsocketFrameSend } = require('./frame')
const { opcodes, sendHints } = require('./constants')

/** @type {typeof Uint8Array} */
const FastBuffer = Buffer[Symbol.species]

/**
 * @typedef {object} SendQueueNode
 * @property {SendQueueNode | null} next
 * @property {Promise<void> | null} promise
 * @property {((...args: any[]) => any)} callback
 * @property {Buffer | null} frame
 */

class SendQueue {
  /**
   * @type {SendQueueNode | null}
   */
  #head = null
  /**
   * @type {SendQueueNode | null}
   */
  #tail = null

  /**
   * @type {boolean}
   */
  #running = false

  /** @type {import('node:net').Socket} */
  #socket

  constructor (socket) {
    this.#socket = socket
  }

  add (item, cb, hint) {
    if (hint !== sendHints.blob) {
      const frame = createFrame(item, hint)
      if (!this.#running) {
        // fast-path
        this.#socket.write(frame, cb)
      } else {
        /** @type {SendQueueNode} */
        const node = {
          next: null,
          promise: null,
          callback: cb,
          frame
        }
        if (this.#tail !== null) {
          this.#tail.next = node
        }
        this.#tail = node
      }
      return
    }

    /** @type {SendQueueNode} */
    const node = {
      next: null,
      promise: item.arrayBuffer().then((ab) => {
        node.promise = null
        node.frame = createFrame(ab, hint)
      }),
      callback: cb,
      frame: null
    }

    if (this.#tail === null) {
      this.#tail = node
    }

    if (this.#head === null) {
      this.#head = node
    }

    if (!this.#running) {
      this.#run()
    }
  }

  async #run () {
    this.#running = true
    /** @type {SendQueueNode | null} */
    let node = this.#head
    while (node !== null) {
      // wait pending promise
      if (node.promise !== null) {
        await node.promise
      }
      // write
      this.#socket.write(node.frame, node.callback)
      // cleanup
      node.callback = node.frame = null
      // set next
      node = node.next
    }
    this.#head = null
    this.#tail = null
    this.#running = false
  }
}

function createFrame (data, hint) {
  return new WebsocketFrameSend(toBuffer(data, hint)).createFrame(hint === sendHints.string ? opcodes.TEXT : opcodes.BINARY)
}

function toBuffer (data, hint) {
  switch (hint) {
    case sendHints.string:
      return Buffer.from(data)
    case sendHints.arrayBuffer:
    case sendHints.blob:
      return new FastBuffer(data)
    case sendHints.typedArray:
      return new FastBuffer(data.buffer, data.byteOffset, data.byteLength)
  }
}

module.exports = { SendQueue }
