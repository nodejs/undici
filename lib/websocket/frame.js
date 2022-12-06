'use strict'

const { randomBytes } = require('crypto')
const assert = require('assert')
const { opcodes } = require('./constants')

class WebsocketFrame {
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
    data = Buffer.alloc(0),
    opcode = opcodes.TEXT,
    fin = false,
    rsv1 = false,
    rsv2 = false,
    rsv3 = false
  } = {}) {
    this.fin = fin
    this.rsv1 = rsv1
    this.rsv2 = rsv2
    this.rsv3 = rsv3
    this.opcode = opcode

    this.data = data
  }

  toBuffer () {
    const buffer = Buffer.alloc(this.byteLength())
    // set FIN flag
    if (this.fin) {
      buffer[0] |= 0x80
    }

    // 2. set opcode
    buffer[0] = (buffer[0] & 0xF0) + this.opcode

    // 4. set payload length
    // TODO: support payload lengths larger than 125
    buffer[1] += this.data.length

    return buffer
  }

  byteLength () {
    // FIN (1), RSV1 (1), RSV2 (1), RSV3 (1), opcode (4) = 1 byte
    let size = 1
    // payload length (7) + mask flag (1) = 1 byte
    size += 1

    if (this.data.length > 2 ** 16 - 1) {
      // unsigned 64 bit number = 8 bytes
      size += 8
    } else if (this.data.length > 2 ** 8 - 1) {
      // unsigned 16 bit number = 2 bytes
      size += 2
    }

    // payload data size
    size += this.data.length

    return size
  }

  static from (buffer) {
    const fin = (buffer[0] & 0x80) !== 0
    const rsv1 = (buffer[0] & 0x40) !== 0
    const rsv2 = (buffer[0] & 0x20) !== 0
    const rsv3 = (buffer[0] & 0x10) !== 0
    const opcode = buffer[0] & 0x0F
    const masked = (buffer[1] & 0x80) !== 0
    const frame = new WebsocketFrame({ fin, rsv1, rsv2, rsv3, opcode })

    // Data sent from an endpoint cannot be masked.
    assert(!masked)

    let payloadLength = 0x7F & buffer[1]
    let lastExaminedByte = 1
    if (payloadLength === 126) {
      // If 126 the following 2 bytes interpreted as a 16-bit unsigned integer
      lastExaminedByte = 4
      payloadLength = Number(buffer.slice(2, 4).readUInt16BE())
    } else if (payloadLength === 127) {
      // if 127 the following 8 bytes interpreted as a 64-bit unsigned integer
      lastExaminedByte = 10
      payloadLength = Number(buffer.slice(2, lastExaminedByte).readBigUInt64BE())
    }

    // check if the frame is complete
    if (payloadLength > buffer.length - lastExaminedByte) {
      return
    }

    // we can't parse the payload inside the frame as the payload could be fragmented across multiple frames..
    frame.data = buffer.slice(lastExaminedByte, lastExaminedByte + payloadLength + 1)

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
    const buffer = Buffer.alloc(this.byteLength())

    buffer[0] |= 0x80 // FIN
    buffer[0] = (buffer[0] & 0xF0) + opcode // opcode

    buffer[1] |= 0x80 // MASK

    buffer[2] = this.maskKey[0]
    buffer[3] = this.maskKey[1]
    buffer[4] = this.maskKey[2]
    buffer[5] = this.maskKey[3]

    buffer[1] += this.frameData.length // payload length

    // mask body
    for (let i = 0; i < this.frameData.length; i++) {
      buffer[6 + i] = this.frameData[i] ^ this.maskKey[i % 4]
    }

    return buffer
  }

  byteLength () {
    // FIN (1), RSV1 (1), RSV2 (1), RSV3 (1), opcode (4) = 1 byte
    let size = 1
    // payload length (7) + mask flag (1) = 1 byte
    size += 1

    if (this.frameData.length > 2 ** 16 - 1) {
      // unsigned 64 bit number = 8 bytes
      size += 8
    } else if (this.frameData.length > 2 ** 8 - 1) {
      // unsigned 16 bit number = 2 bytes
      size += 2
    }

    // masking key = 4 bytes
    size += 4

    // payload data size
    size += this.frameData.length

    return size
  }
}

module.exports = {
  WebsocketFrame,
  WebsocketFrameSend
}
