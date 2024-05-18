'use strict'

const { WebsocketFrameSend } = require('./frame')
const { opcodes, sendHints } = require('./constants')

/** @type {Uint8Array} */
const FastBuffer = Buffer[Symbol.species]

class SendQueue {
  #queued = new Set()
  #size = 0

  /** @type {import('net').Socket} */
  #socket

  constructor (socket) {
    this.#socket = socket
  }

  add (item, cb, hint) {
    if (hint !== sendHints.blob) {
      if (this.#size === 0) {
        this.#dispatch(item, cb, hint)
      } else {
        this.#queued.add([item, cb, true, hint])
        this.#size++

        this.#run()
      }

      return
    }

    const promise = item.arrayBuffer()
    const queue = [null, cb, false, hint]
    promise.then((ab) => {
      queue[0] = ab
      queue[2] = true

      this.#run()
    })

    this.#queued.add(queue)
    this.#size++
  }

  #run () {
    for (const queued of this.#queued) {
      const [data, cb, done, hint] = queued

      if (!done) return

      this.#queued.delete(queued)
      this.#size--

      this.#dispatch(data, cb, hint)
    }
  }

  #dispatch (data, cb, hint) {
    let value

    switch (hint) {
      case sendHints.string:
        value = Buffer.from(data)
        break
      case sendHints.arrayBuffer:
      case sendHints.blob:
        value = new FastBuffer(data)
        break
      case sendHints.typedArray:
        value = new FastBuffer(data.buffer, data.byteOffset, data.byteLength)
        break
    }

    const frame = new WebsocketFrameSend()
    const opcode = hint === sendHints.string ? opcodes.TEXT : opcodes.BINARY

    frame.frameData = value
    const buffer = frame.createFrame(opcode)

    this.#socket.write(buffer, cb)
  }
}

module.exports = { SendQueue }
