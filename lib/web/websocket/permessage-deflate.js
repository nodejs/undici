'use strict'

const { createInflateRaw } = require('node:zlib')

const tail = Buffer.from([0x00, 0x00, 0xff, 0xff])
const kBuffer = Symbol('kBuffer')
const kLength = Symbol('kLength')

class PerMessageDeflate {
  /** @type {import('node:zlib').InflateRaw} */
  #inflate

  decompress (chunk, fin, callback) {
    // An endpoint uses the following algorithm to decompress a message.
    // 1.  Append 4 octets of 0x00 0x00 0xff 0xff to the tail end of the
    //     payload of the message.
    // 2.  Decompress the resulting data using DEFLATE.

    if (!this.#inflate) {
      this.#inflate = createInflateRaw(/* TODO */)
      this.#inflate[kBuffer] = []
      this.#inflate[kLength] = 0

      this.#inflate.on('data', (data) => {
        this.#inflate[kBuffer].push(data)
        this.#inflate[kLength] += data.length
      })
    }

    this.#inflate.write(chunk)
    if (fin) {
      this.#inflate.write(tail)
    }

    this.#inflate.flush(() => {
      const full = Buffer.concat(this.#inflate[kBuffer], this.#inflate[kLength])
      callback(full)

      this.#inflate[kBuffer].length = 0
      this.#inflate[kLength] = 0
    })
  }
}

module.exports = { PerMessageDeflate }
