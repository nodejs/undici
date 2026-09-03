'use strict'

const { createInflateRaw, Z_DEFAULT_WINDOWBITS } = require('node:zlib')
const { isValidClientWindowBits } = require('./util')
const { MessageSizeExceededError } = require('../../core/errors')

const tail = Buffer.from([0x00, 0x00, 0xff, 0xff])
const kBuffer = Symbol('kBuffer')
const kLength = Symbol('kLength')

class PerMessageDeflate {
  /** @type {import('node:zlib').InflateRaw} */
  #inflate

  #options = {}

  #maxPayloadSize = 0

  #currentCallback = null

  #currentPayloadSize = 0

  /**
   * @param {Map<string, string>} extensions
   */
  constructor (extensions, options) {
    this.#options.serverNoContextTakeover = extensions.has('server_no_context_takeover')
    this.#options.serverMaxWindowBits = extensions.get('server_max_window_bits')

    this.#maxPayloadSize = options.maxPayloadSize
  }

  /**
   * Decompress a compressed payload.
   * @param {Buffer} chunk Compressed data
   * @param {boolean} fin Final fragment flag
   * @param {Function} callback Callback function
   * @param {number} currentPayloadSize Current decompressed message size
   */
  decompress (chunk, fin, callback, currentPayloadSize = 0) {
    // An endpoint uses the following algorithm to decompress a message.
    // 1.  Append 4 octets of 0x00 0x00 0xff 0xff to the tail end of the
    //     payload of the message.
    // 2.  Decompress the resulting data using DEFLATE.
    this.#currentCallback = callback
    this.#currentPayloadSize = currentPayloadSize

    if (!this.#inflate) {
      let windowBits = Z_DEFAULT_WINDOWBITS

      if (this.#options.serverMaxWindowBits) { // empty values default to Z_DEFAULT_WINDOWBITS
        if (!isValidClientWindowBits(this.#options.serverMaxWindowBits)) {
          callback(new Error('Invalid server_max_window_bits'))
          return
        }

        windowBits = Number.parseInt(this.#options.serverMaxWindowBits)
      }

      try {
        this.#inflate = createInflateRaw({ windowBits })
      } catch (err) {
        callback(err)
        return
      }
      this.#inflate[kBuffer] = []
      this.#inflate[kLength] = 0

      this.#inflate.on('data', (data) => {
        this.#inflate[kLength] += data.length

        if (this.#maxPayloadSize > 0 && this.#currentPayloadSize + this.#inflate[kLength] > this.#maxPayloadSize) {
          const currentCallback = this.#currentCallback

          this.#currentCallback = null
          this.#currentPayloadSize = 0
          this.#inflate.removeAllListeners()
          this.#inflate = null

          currentCallback?.(new MessageSizeExceededError())
          return
        }

        this.#inflate[kBuffer].push(data)
      })

      this.#inflate.on('error', (err) => {
        const currentCallback = this.#currentCallback

        this.#currentCallback = null
        this.#currentPayloadSize = 0
        this.#inflate = null
        currentCallback?.(err)
      })
    }

    this.#inflate.write(chunk)
    if (!this.#inflate) {
      return
    }

    if (fin) {
      this.#inflate.write(tail)
      if (!this.#inflate) {
        return
      }
    }

    this.#inflate.flush(() => {
      if (!this.#inflate) {
        return
      }

      const full = Buffer.concat(this.#inflate[kBuffer], this.#inflate[kLength])

      this.#inflate[kBuffer].length = 0
      this.#inflate[kLength] = 0
      this.#currentCallback = null
      this.#currentPayloadSize = 0

      callback(null, full)
    })
  }
}

module.exports = { PerMessageDeflate }
