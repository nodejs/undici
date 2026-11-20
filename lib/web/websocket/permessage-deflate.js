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

  /** @type {{ callback: Function } | null} */
  #operation = null

  /**
   * @param {Map<string, string>} extensions
   */
  constructor (extensions, options) {
    this.#options.serverNoContextTakeover = extensions.has('server_no_context_takeover')
    this.#options.serverMaxWindowBits = extensions.get('server_max_window_bits')

    this.#maxPayloadSize = options.maxPayloadSize
  }

  #complete (operation, error, data) {
    if (this.#operation !== operation) {
      return
    }

    this.#operation = null
    operation.callback(error, data)
  }

  #destroyInflate (inflate) {
    if (this.#inflate === inflate) {
      this.#inflate = null
    }

    inflate.removeAllListeners()
    inflate.destroy()
  }

  /**
   * Decompress a compressed payload.
   * @param {Buffer} chunk Compressed data
   * @param {boolean} fin Final fragment flag
   * @param {Function} callback Callback function
   */
  decompress (chunk, fin, callback) {
    const operation = { callback }
    this.#operation = operation

    // An endpoint uses the following algorithm to decompress a message.
    // 1.  Append 4 octets of 0x00 0x00 0xff 0xff to the tail end of the
    //     payload of the message.
    // 2.  Decompress the resulting data using DEFLATE.
    if (!this.#inflate) {
      let windowBits = Z_DEFAULT_WINDOWBITS

      if (this.#options.serverMaxWindowBits) { // empty values default to Z_DEFAULT_WINDOWBITS
        if (!isValidClientWindowBits(this.#options.serverMaxWindowBits)) {
          this.#complete(operation, new Error('Invalid server_max_window_bits'))
          return
        }

        windowBits = Number.parseInt(this.#options.serverMaxWindowBits)
      }

      let inflate
      try {
        inflate = createInflateRaw({ windowBits })
      } catch (err) {
        this.#complete(operation, err)
        return
      }

      this.#inflate = inflate
      inflate[kBuffer] = []
      inflate[kLength] = 0

      inflate.on('data', (data) => {
        if (this.#inflate !== inflate) {
          return
        }

        inflate[kLength] += data.length

        if (this.#maxPayloadSize > 0 && inflate[kLength] > this.#maxPayloadSize) {
          const operation = this.#operation

          // The inflater may still hold buffered input that can emit a late
          // zlib error. Remove its listeners and deterministically stop it.
          this.#destroyInflate(inflate)

          if (operation !== null) {
            this.#complete(operation, new MessageSizeExceededError())
          }
          return
        }

        inflate[kBuffer].push(data)
      })

      inflate.on('error', (err) => {
        if (this.#inflate !== inflate) {
          return
        }

        const operation = this.#operation
        this.#destroyInflate(inflate)

        if (operation !== null) {
          this.#complete(operation, err)
        }
      })
    }

    const inflate = this.#inflate

    inflate.write(chunk)
    if (fin) {
      inflate.write(tail)
    }

    inflate.flush(() => {
      if (this.#inflate !== inflate) {
        return
      }

      const full = Buffer.concat(inflate[kBuffer], inflate[kLength])

      inflate[kBuffer].length = 0
      inflate[kLength] = 0

      this.#complete(operation, null, full)
    })
  }
}

module.exports = { PerMessageDeflate }
