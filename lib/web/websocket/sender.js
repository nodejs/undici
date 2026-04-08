'use strict'

const { WebsocketFrameSend } = require('./frame')
const { opcodes, sendHints } = require('./constants')
const FixedQueue = require('../../dispatcher/fixed-queue')
const { channels } = require('../../core/diagnostics')

/**
 * @typedef {object} SendQueueNode
 * @property {Promise<void> | null} promise
 * @property {((...args: any[]) => any)} callback
 * @property {Buffer | null} frame
 * @property {{ data: Buffer | ArrayBuffer | ArrayBufferView | null, hint: number }} diagnosticInfo
 */

class SendQueue {
  /**
   * @type {FixedQueue}
   */
  #queue = new FixedQueue()

  /**
   * @type {boolean}
   */
  #running = false

  /** @type {import('node:net').Socket} */
  #socket

  #websocket

  constructor (socket, websocket) {
    this.#socket = socket
    this.#websocket = websocket
  }

  add (item, cb, hint) {
    if (hint !== sendHints.blob) {
      if (!this.#running) {
        // TODO(@tsctx): support fast-path for string on running
        if (hint === sendHints.text) {
          // special fast-path for string
          publishFrame(this.#websocket, opcodes.TEXT, item, hint)
          const { 0: head, 1: body } = WebsocketFrameSend.createFastTextFrame(item)
          this.#socket.cork()
          this.#socket.write(head)
          this.#socket.write(body, cb)
          this.#socket.uncork()
        } else {
          // direct writing
          publishFrame(this.#websocket, opcodes.BINARY, item, hint)
          this.#socket.write(createFrame(item, hint), cb)
        }
      } else {
        /** @type {SendQueueNode} */
        const node = {
          promise: null,
          callback: cb,
          frame: createFrame(item, hint),
          diagnosticInfo: {
            data: item,
            hint
          }
        }
        this.#queue.push(node)
      }
      return
    }

    /** @type {SendQueueNode} */
    const node = {
      promise: item.arrayBuffer().then((ab) => {
        node.promise = null
        node.diagnosticInfo.data = ab
        node.frame = createFrame(ab, hint)
      }),
      callback: cb,
      frame: null,
      diagnosticInfo: {
        data: item,
        hint
      }
    }

    this.#queue.push(node)

    if (!this.#running) {
      this.#run()
    }
  }

  async #run () {
    this.#running = true
    const queue = this.#queue
    while (!queue.isEmpty()) {
      const node = queue.shift()
      // wait pending promise
      if (node.promise !== null) {
        await node.promise
      }
      // write
      if (node.frame !== null) {
        publishQueuedFrame(this.#websocket, node.frame, node.diagnosticInfo)
      }
      this.#socket.write(node.frame, node.callback)
      // cleanup
      node.callback = node.frame = null
    }
    this.#running = false
  }
}

function createFrame (data, hint) {
  return new WebsocketFrameSend(toBuffer(data, hint)).createFrame(hint === sendHints.text ? opcodes.TEXT : opcodes.BINARY)
}

function toBuffer (data, hint) {
  switch (hint) {
    case sendHints.text:
    case sendHints.typedArray:
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    case sendHints.arrayBuffer:
    case sendHints.blob:
      return new Uint8Array(data)
  }
}

function publishFrame (websocket, opcode, data, hint) {
  if (!channels.frameSent.hasSubscribers) {
    return
  }

  channels.frameSent.publish({
    websocket,
    opcode,
    payloadData: Buffer.from(toBuffer(data, hint))
  })
}

function publishQueuedFrame (websocket, frame, diagnosticInfo) {
  if (!channels.frameSent.hasSubscribers) {
    return
  }

  channels.frameSent.publish({
    websocket,
    opcode: frame[0] & 0x0F,
    payloadData: Buffer.from(toBuffer(diagnosticInfo.data, diagnosticInfo.hint))
  })
}

module.exports = { SendQueue }
