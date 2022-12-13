const { Writable } = require('stream')
const { parserStates } = require('./constants')

class ByteParser extends Writable {
  #buffers = []
  #byteOffset = 0

  #state = parserStates.INFO

  #info = {}

  constructor (ws) {
    super()

    this.ws = ws
  }

  /**
   * @param {Buffer} chunk
   * @param {() => void} callback
   */
  _write (chunk, _, callback) {
    this.#buffers.push(chunk)
    this.#byteOffset += chunk.length

    this.run(callback)
  }

  /**
   * Runs whenever a new chunk is received.
   * Callback is called whenever there are no more chunks buffering,
   * or not enough bytes are buffered to parse.
   */
  run (callback) {
    if (this.#state === parserStates.INFO) {
      // If there aren't enough bytes to parse the payload length, etc.
      if (this.#byteOffset < 2) {
        return callback()
      }

      const buffer = Buffer.concat(this.#buffers, this.#byteOffset)

      this.#info.fin = (buffer[0] & 0x80) !== 0
      this.#info.opcode = buffer[0] & 0x0F

      // TODO: HANDLE INVALID OPCODES HERE

      const payloadLength = buffer[1] & 0x7F

      if (payloadLength <= 125) {
        this.#info.payloadLength = payloadLength
        this.#state = parserStates.READ_DATA
      } else if (payloadLength === 126) {
        this.#state = parserStates.PAYLOADLENGTH_16
      } else if (payloadLength === 127) {
        this.#state = parserStates.PAYLOADLENGTH_64
      }

      this.#buffers = [buffer.subarray(2)]
      this.#byteOffset -= 2
    } else if (this.#state === parserStates.PAYLOADLENGTH_16) {
      if (this.#byteOffset < 2) {
        return callback()
      }

      const buffer = Buffer.concat(this.#buffers, this.#byteOffset)

      // TODO: optimize this
      this.#info.payloadLength = buffer.subarray(0, 2).readUInt16BE(0)
      this.#state = parserStates.READ_DATA

      this.#buffers = [buffer.subarray(2)]
      this.#byteOffset -= 2
    } else if (this.#state === parserStates.PAYLOADLENGTH_64) {
      if (this.#byteOffset < 8) {
        return callback()
      }

      const buffer = Buffer.concat(this.#buffers, this.#byteOffset)

      // TODO: optimize this
      this.#info.payloadLength = buffer.subarray(0, 8).readBigUint64BE(0)
      this.#state = parserStates.READ_DATA

      this.#buffers = [buffer.subarray(8)]
      this.#byteOffset -= 8
    } else if (this.#state === parserStates.READ_DATA) {
      if (this.#byteOffset < this.#info.payloadLength) {
        // If there is still more data in this chunk that needs to be read
        return callback()
      } else if (this.#byteOffset >= this.#info.payloadLength) {
        // If the server sent multiple frames in a single chunk
        const buffer = Buffer.concat(this.#buffers, this.#byteOffset)

        this.#info.data = buffer.subarray(0, this.#info.payloadLength)

        if (this.#byteOffset > this.#info.payloadLength) {
          this.#buffers = [buffer.subarray(this.#info.data.length)]
          this.#byteOffset -= this.#info.data.length
        } else {
          this.#buffers.length = 0
          this.#byteOffset = 0
        }

        this.#info = {}
        this.#state = parserStates.INFO
      }
    }

    if (this.#byteOffset > 0) {
      return this.run(callback)
    } else {
      callback()
    }
  }
}

module.exports = {
  ByteParser
}
