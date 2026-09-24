'use strict'

const { runtimeFeatures } = require('../../util/runtime-features')
const { maxUnsigned16Bit, opcodes } = require('./constants')

const BUFFER_SIZE = 8 * 1024

let buffer = null
let bufIdx = BUFFER_SIZE

const randomFillSync = runtimeFeatures.has('crypto')
  ? require('node:crypto').randomFillSync
  : null

/**
 * Writes the next mask key into target at offset.
 * @param {Uint8Array|number[]} target
 * @param {number} offset
 */
function writeMask (target, offset) {
  if (bufIdx === BUFFER_SIZE) {
    bufIdx = 0
    randomFillSync((buffer ??= Buffer.allocUnsafeSlow(BUFFER_SIZE)), 0, BUFFER_SIZE)
  }
  target[offset] = buffer[bufIdx++]
  target[offset + 1] = buffer[bufIdx++]
  target[offset + 2] = buffer[bufIdx++]
  target[offset + 3] = buffer[bufIdx++]
}

function generateMask () {
  const mask = [0, 0, 0, 0]
  writeMask(mask, 0)
  return mask
}

/**
 * Writes source[0, length) XOR the mask key at mask[maskOffset, maskOffset + 4)
 * into target, starting at targetOffset. source and target may be the same
 * buffer when targetOffset is 0.
 * @param {Uint8Array} source
 * @param {Uint8Array} target
 * @param {number} targetOffset
 * @param {Uint8Array} mask
 * @param {number} maskOffset
 * @param {number} length
 */
function maskPayload (source, target, targetOffset, mask, maskOffset, length) {
  const mask0 = mask[maskOffset]
  const mask1 = mask[maskOffset + 1]
  const mask2 = mask[maskOffset + 2]
  const mask3 = mask[maskOffset + 3]
  const end = length - (length & 3)

  // Four bytes per step, then the remaining zero to three bytes.
  for (let i = 0; i < end; i += 4) {
    target[targetOffset + i] = source[i] ^ mask0
    target[targetOffset + i + 1] = source[i + 1] ^ mask1
    target[targetOffset + i + 2] = source[i + 2] ^ mask2
    target[targetOffset + i + 3] = source[i + 3] ^ mask3
  }

  const rest = length - end
  if (rest > 0) target[targetOffset + end] = source[end] ^ mask0
  if (rest > 1) target[targetOffset + end + 1] = source[end + 1] ^ mask1
  if (rest > 2) target[targetOffset + end + 2] = source[end + 2] ^ mask2
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
    writeMask(buffer, offset - 4)

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
    maskPayload(frameData, buffer, offset, buffer, offset - 4, bodyLength)

    return buffer
  }

  /**
   * @param {Uint8Array} buffer
   */
  static createFastTextFrame (buffer) {
    const bodyLength = buffer.length

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
    const maskOffset = offset - 4

    writeMask(head, maskOffset)

    // mask body
    maskPayload(buffer, buffer, 0, head, maskOffset, bodyLength)

    head[0] = 0x80 /* FIN */ | opcodes.TEXT /* opcode TEXT */
    head[1] = payloadLength | 0x80 /* MASK */

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
