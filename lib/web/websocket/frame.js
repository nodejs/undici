'use strict'

const { runtimeFeatures } = require('../../util/runtime-features')
const { maxUnsigned16Bit, opcodes } = require('./constants')

const BUFFER_SIZE = 8 * 1024

let buffer = null
let bufIdx = BUFFER_SIZE

const randomFillSync = runtimeFeatures.has('crypto')
  ? require('node:crypto').randomFillSync
  : null

function generateMask () {
  if (bufIdx === BUFFER_SIZE) {
    bufIdx = 0
    randomFillSync((buffer ??= Buffer.allocUnsafeSlow(BUFFER_SIZE)), 0, BUFFER_SIZE)
  }
  return [buffer[bufIdx++], buffer[bufIdx++], buffer[bufIdx++], buffer[bufIdx++]]
}

function maskPayload (source, target, targetOffset, maskKey) {
  const length = source.byteLength
  const mask0 = maskKey[0]
  const mask1 = maskKey[1]
  const mask2 = maskKey[2]
  const mask3 = maskKey[3]
  const unrolledEnd = length & ~7

  let i = 0
  for (; i < unrolledEnd; i += 8) {
    target[targetOffset + i] = source[i] ^ mask0
    target[targetOffset + i + 1] = source[i + 1] ^ mask1
    target[targetOffset + i + 2] = source[i + 2] ^ mask2
    target[targetOffset + i + 3] = source[i + 3] ^ mask3
    target[targetOffset + i + 4] = source[i + 4] ^ mask0
    target[targetOffset + i + 5] = source[i + 5] ^ mask1
    target[targetOffset + i + 6] = source[i + 6] ^ mask2
    target[targetOffset + i + 7] = source[i + 7] ^ mask3
  }

  for (; i < length; ++i) {
    target[targetOffset + i] = source[i] ^ maskKey[i & 3]
  }
}

class WebsocketFrameSend {
  /**
   * @param {Buffer|undefined} data
   */
  constructor (data) {
    this.frameData = data
  }

  createFrame (opcode) {
    const frameData = this.frameData
    const maskKey = generateMask()
    const bodyLength = frameData?.byteLength ?? 0

    /** @type {number} */
    let payloadLength = bodyLength // 0-125
    let offset = 6

    if (bodyLength > maxUnsigned16Bit) {
      offset += 8 // payload length is next 8 bytes
      payloadLength = 127
    } else if (bodyLength > 125) {
      offset += 2 // payload length is next 2 bytes
      payloadLength = 126
    }

    const buffer = Buffer.allocUnsafe(bodyLength + offset)

    // Clear first 2 bytes, everything else is overwritten
    buffer[0] = buffer[1] = 0
    buffer[0] |= 0x80 // FIN
    buffer[0] = (buffer[0] & 0xF0) + opcode // opcode

    /*! ws. MIT License. Einar Otto Stangvik <einaros@gmail.com> */
    buffer[offset - 4] = maskKey[0]
    buffer[offset - 3] = maskKey[1]
    buffer[offset - 2] = maskKey[2]
    buffer[offset - 1] = maskKey[3]

    buffer[1] = payloadLength

    if (payloadLength === 126) {
      buffer.writeUInt16BE(bodyLength, 2)
    } else if (payloadLength === 127) {
      // Clear extended payload length
      buffer[2] = buffer[3] = 0
      buffer.writeUIntBE(bodyLength, 4, 6)
    }

    buffer[1] |= 0x80 // MASK

    // mask body
    if (bodyLength !== 0) {
      maskPayload(frameData, buffer, offset, maskKey)
    }

    return buffer
  }

  /**
   * @param {Uint8Array} buffer
   */
  static createFastTextFrame (buffer) {
    const maskKey = generateMask()

    const bodyLength = buffer.length

    // mask body
    maskPayload(buffer, buffer, 0, maskKey)

    let payloadLength = bodyLength
    let offset = 6

    if (bodyLength > maxUnsigned16Bit) {
      offset += 8 // payload length is next 8 bytes
      payloadLength = 127
    } else if (bodyLength > 125) {
      offset += 2 // payload length is next 2 bytes
      payloadLength = 126
    }
    const head = Buffer.allocUnsafeSlow(offset)

    head[0] = 0x80 /* FIN */ | opcodes.TEXT /* opcode TEXT */
    head[1] = payloadLength | 0x80 /* MASK */
    head[offset - 4] = maskKey[0]
    head[offset - 3] = maskKey[1]
    head[offset - 2] = maskKey[2]
    head[offset - 1] = maskKey[3]

    if (payloadLength === 126) {
      head.writeUInt16BE(bodyLength, 2)
    } else if (payloadLength === 127) {
      head[2] = head[3] = 0
      head.writeUIntBE(bodyLength, 4, 6)
    }

    return [head, buffer]
  }
}

module.exports = {
  WebsocketFrameSend,
  generateMask // for benchmark
}
