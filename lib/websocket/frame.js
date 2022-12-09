'use strict'

const { randomBytes } = require('crypto')
const assert = require('assert')
const { opcodes } = require('./constants')
const { isValidStatusCode } = require('./util')
const { WebsocketHooks } = require('./hooks')

class WebsocketFrame {
  #fragmentComplete = false

  /**
   * Whether a frame (unfragmented or fragmented) is complete.
   */
  get terminated () {
    return this.#fragmentComplete
  }

  set terminated (value) {
    this.#fragmentComplete = value
  }

  /*
  https://www.rfc-editor.org/rfc/rfc6455#section-5.2
  0                   1                   2                   3
  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
 +-+-+-+-+-------+-+-------------+-------------------------------+
 |F|R|R|R| opcode|M| Payload len |    Extended payload length    |
 |I|S|S|S|  (4)  |A|     (7)     |             (16/64)           |
 |N|V|V|V|       |S|             |   (if payload len==126/127)   |
 | |1|2|3|       |K|             |                               |
 +-+-+-+-+-------+-+-------------+ - - - - - - - - - - - - - - - +
 |     Extended payload length continued, if payload len == 127  |
 + - - - - - - - - - - - - - - - +-------------------------------+
 |                               |Masking-key, if MASK set to 1  |
 +-------------------------------+-------------------------------+
 | Masking-key (continued)       |          Payload Data         |
 +-------------------------------- - - - - - - - - - - - - - - - +
 :                     Payload Data continued ...                :
 + - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - +
 |                     Payload Data continued ...                |
 +---------------------------------------------------------------+
 */
  constructor ({
    opcode = opcodes.TEXT,
    fin = false,
    rsv1 = false,
    rsv2 = false,
    rsv3 = false,
    payloadLength,
    data
  } = {}) {
    this.fin = fin
    this.rsv1 = rsv1
    this.rsv2 = rsv2
    this.rsv3 = rsv3
    this.opcode = opcode

    if (this.opcode !== opcodes.CLOSE) {
      this.data = Buffer.alloc(payloadLength)
      this.dataOffset = 0

      if (data) {
        this.addFrame(data)
      }
    } else {
      this.data = data
    }

    this.payloadLength = payloadLength
    this.fragmented = !this.fin && this.opcode !== opcodes.CONTINUATION
  }

  addFrame (buffer) {
    this.data.set(buffer, this.dataOffset)
    this.dataOffset += buffer.length
  }

  parseCloseBody (onlyCode) {
    assert(this.data)

    // https://datatracker.ietf.org/doc/html/rfc6455#section-7.1.5
    /** @type {number|undefined} */
    let code

    if (this.data.length > 2) {
      // _The WebSocket Connection Close Code_ is
      // defined as the status code (Section 7.4) contained in the first Close
      // control frame received by the application
      code = this.data.readUInt16BE(0)
    }

    if (onlyCode) {
      if (!isValidStatusCode(code)) {
        return null
      }

      return { code }
    }

    // https://datatracker.ietf.org/doc/html/rfc6455#section-7.1.6
    /** @type {Buffer} */
    let reason = this.data.slice(2)

    // Remove BOM
    if (reason[0] === 0xEF && reason[1] === 0xBB && reason[2] === 0xBF) {
      reason = reason.subarray(3)
    }

    if (code !== undefined && !isValidStatusCode(code)) {
      return null
    } else if (!WebsocketHooks.get('utf-8')(reason)) {
      return null
    }

    return { code, reason: reason.toString('utf-8') }
  }

  /**
   * @param {Buffer} buffer
   */
  static from (buffer) {
    const fin = (buffer[0] & 0x80) !== 0
    const rsv1 = (buffer[0] & 0x40) !== 0
    const rsv2 = (buffer[0] & 0x20) !== 0
    const rsv3 = (buffer[0] & 0x10) !== 0
    const opcode = buffer[0] & 0x0F
    const masked = (buffer[1] & 0x80) !== 0

    // Data sent from an endpoint cannot be masked.
    assert(!masked)

    let payloadLength = 0
    let data

    if (buffer[1] <= 125) {
      payloadLength = buffer[1]
      data = buffer.subarray(2)
    } else if (buffer[1] === 126) {
      payloadLength = buffer.subarray(2, 4).readUInt16BE()
      data = buffer.subarray(4)
    } else if (buffer[1] === 127) {
      payloadLength = buffer.subarray(2, 10).readBigUint64BE()
      data = buffer.subarray(10)
    }

    const frame = new WebsocketFrame({
      fin,
      rsv1,
      rsv2,
      rsv3,
      opcode,
      payloadLength,
      data
    })

    return frame
  }
}

class WebsocketFrameSend {
  /**
   * @param {Buffer|undefined} data
   */
  constructor (data) {
    this.frameData = data
    this.maskKey = randomBytes(4)
  }

  createFrame (opcode) {
    const bodyLength = this.frameData?.byteLength ?? 0

    /** @type {number} */
    let payloadLength = bodyLength // 0-125
    let offset = 6

    if (bodyLength > 65535) {
      offset += 8 // payload length is next 8 bytes
      payloadLength = 127
    } else if (bodyLength > 125) {
      offset += 2 // payload length is next 2 bytes
      payloadLength = 126
    }

    const buffer = Buffer.alloc(bodyLength + offset)

    buffer[0] |= 0x80 // FIN
    buffer[0] = (buffer[0] & 0xF0) + opcode // opcode

    /*! ws. MIT License. Einar Otto Stangvik <einaros@gmail.com> */
    buffer[offset - 4] = this.maskKey[0]
    buffer[offset - 3] = this.maskKey[1]
    buffer[offset - 2] = this.maskKey[2]
    buffer[offset - 1] = this.maskKey[3]

    buffer[1] = payloadLength

    if (payloadLength === 126) {
      buffer.writeUInt16BE(bodyLength, 2)
    } else if (payloadLength === 127) {
      buffer.writeUIntBE(bodyLength, 4, 6)
    }

    buffer[1] |= 0x80 // MASK

    // mask body
    for (let i = 0; i < this.frameData?.length ?? 0; i++) {
      buffer[offset + i] = this.frameData[i] ^ this.maskKey[i % 4]
    }

    return buffer
  }
}

module.exports = {
  WebsocketFrame,
  WebsocketFrameSend
}
