'use strict'

const { Writable } = require('node:stream')
const assert = require('node:assert')
const { parserStates, opcodes, states, emptyBuffer, sentCloseFrameState } = require('./constants')
const { kReadyState, kSentClose, kResponse, kReceivedClose } = require('./symbols')
const { channels } = require('../../core/diagnostics')
const {
  isValidStatusCode,
  isValidOpcode,
  failWebsocketConnection,
  websocketMessageReceived,
  utf8Decode,
  isControlFrame,
  isContinuationFrame
} = require('./util')
const { WebsocketFrameSend } = require('./frame')
const { CloseEvent } = require('./events')

// This code was influenced by ws released under the MIT license.
// Copyright (c) 2011 Einar Otto Stangvik <einaros@gmail.com>
// Copyright (c) 2013 Arnout Kazemier and contributors
// Copyright (c) 2016 Luigi Pinca and contributors

class ByteParser extends Writable {
  #buffers = []
  #byteOffset = 0

  #state = parserStates.INFO

  #info = {}
  #fragments = []

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
    while (true) {
      if (this.#state === parserStates.INFO) {
        // If there aren't enough bytes to parse the payload length, etc.
        if (this.#byteOffset < 2) {
          return callback()
        }

        const buffer = this.consume(2)
        const fin = (buffer[0] & 0x80) !== 0
        const opcode = buffer[0] & 0x0F
        const masked = (buffer[1] & 0x80) === 0x80

        if (!isValidOpcode(opcode)) {
          failWebsocketConnection(this.ws, 'Invalid opcode received')
          return callback()
        }

        if (masked) {
          failWebsocketConnection(this.ws, 'Frame cannot be masked')
          return callback()
        }

        const fragmented = !fin && opcode !== opcodes.CONTINUATION

        if (fragmented && opcode !== opcodes.BINARY && opcode !== opcodes.TEXT) {
          // Only text and binary frames can be fragmented
          failWebsocketConnection(this.ws, 'Invalid frame type was fragmented.')
          return
        }

        const payloadLength = buffer[1] & 0x7F

        if (isControlFrame(opcode)) {
          const loop = this.parseControlFrame(callback, {
            opcode,
            fragmented,
            payloadLength
          })

          if (loop) {
            continue
          } else {
            return
          }
        } else if (isContinuationFrame(opcode)) {
          const loop = this.parseContinuationFrame(callback, {
            fin,
            fragmented,
            payloadLength
          })

          if (loop) {
            continue
          } else {
            return
          }
        }

        if (payloadLength <= 125) {
          this.#info.payloadLength = payloadLength
          this.#state = parserStates.READ_DATA
        } else if (payloadLength === 126) {
          this.#state = parserStates.PAYLOADLENGTH_16
        } else if (payloadLength === 127) {
          this.#state = parserStates.PAYLOADLENGTH_64
        }

        this.#info.opcode = opcode
        this.#info.masked = masked
        this.#info.fin = fin
        this.#info.fragmented = fragmented

        if (this.#info.fragmented && payloadLength > 125) {
          // A fragmented frame can't be fragmented itself
          failWebsocketConnection(this.ws, 'Fragmented frame exceeded 125 bytes.')
          return
        }
      } else if (this.#state === parserStates.PAYLOADLENGTH_16) {
        if (this.#byteOffset < 2) {
          return callback()
        }

        const buffer = this.consume(2)

        this.#info.payloadLength = buffer.readUInt16BE(0)
        this.#state = parserStates.READ_DATA
      } else if (this.#state === parserStates.PAYLOADLENGTH_64) {
        if (this.#byteOffset < 8) {
          return callback()
        }

        const buffer = this.consume(8)
        const upper = buffer.readUInt32BE(0)

        // 2^31 is the maximum bytes an arraybuffer can contain
        // on 32-bit systems. Although, on 64-bit systems, this is
        // 2^53-1 bytes.
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Invalid_array_length
        // https://source.chromium.org/chromium/chromium/src/+/main:v8/src/common/globals.h;drc=1946212ac0100668f14eb9e2843bdd846e510a1e;bpv=1;bpt=1;l=1275
        // https://source.chromium.org/chromium/chromium/src/+/main:v8/src/objects/js-array-buffer.h;l=34;drc=1946212ac0100668f14eb9e2843bdd846e510a1e
        if (upper > 2 ** 31 - 1) {
          failWebsocketConnection(this.ws, 'Received payload length > 2^31 bytes.')
          return
        }

        const lower = buffer.readUInt32BE(4)

        this.#info.payloadLength = (upper << 8) + lower
        this.#state = parserStates.READ_DATA
      } else if (this.#state === parserStates.READ_DATA) {
        if (this.#byteOffset < this.#info.payloadLength) {
          // If there is still more data in this chunk that needs to be read
          return callback()
        } else if (this.#byteOffset >= this.#info.payloadLength) {
          const body = this.consume(this.#info.payloadLength)
          this.#fragments.push(body)

          // If the frame is not fragmented, a message has been received.
          // If the frame is fragmented, it will terminate with a fin bit set
          // and an opcode of 0 (continuation), therefore we handle that when
          // parsing continuation frames, not here.
          if (!this.#info.fragmented) {
            const fullMessage = Buffer.concat(this.#fragments)
            websocketMessageReceived(this.ws, this.#info.opcode, fullMessage)
            this.#info = {}
            this.#fragments.length = 0
          }

          this.#state = parserStates.INFO
        }
      }

      if (this.#byteOffset === 0 && this.#info.payloadLength !== 0) {
        callback()
        break
      }
    }
  }

  /**
   * Take n bytes from the buffered Buffers
   * @param {number} n
   * @returns {Buffer|null}
   */
  consume (n) {
    if (n > this.#byteOffset) {
      return null
    } else if (n === 0) {
      return emptyBuffer
    }

    if (this.#buffers[0].length === n) {
      this.#byteOffset -= this.#buffers[0].length
      return this.#buffers.shift()
    }

    const buffer = Buffer.allocUnsafe(n)
    let offset = 0

    while (offset !== n) {
      const next = this.#buffers[0]
      const { length } = next

      if (length + offset === n) {
        buffer.set(this.#buffers.shift(), offset)
        break
      } else if (length + offset > n) {
        buffer.set(next.subarray(0, n - offset), offset)
        this.#buffers[0] = next.subarray(n - offset)
        break
      } else {
        buffer.set(this.#buffers.shift(), offset)
        offset += next.length
      }
    }

    this.#byteOffset -= n

    return buffer
  }

  parseCloseBody (data) {
    assert(data.length !== 1)

    // https://datatracker.ietf.org/doc/html/rfc6455#section-7.1.5
    /** @type {number|undefined} */
    let code

    if (data.length >= 2) {
      // _The WebSocket Connection Close Code_ is
      // defined as the status code (Section 7.4) contained in the first Close
      // control frame received by the application
      code = data.readUInt16BE(0)
    }

    if (code !== undefined && !isValidStatusCode(code)) {
      return { code: 1002, reason: 'Invalid status code', error: true }
    }

    // https://datatracker.ietf.org/doc/html/rfc6455#section-7.1.6
    /** @type {Buffer} */
    let reason = data.subarray(2)

    // Remove BOM
    if (reason[0] === 0xEF && reason[1] === 0xBB && reason[2] === 0xBF) {
      reason = reason.subarray(3)
    }

    try {
      reason = utf8Decode(reason)
    } catch {
      return { code: 1007, reason: 'Invalid UTF-8', error: true }
    }

    return { code, reason, error: false }
  }

  /**
   * Parses control frames.
   * @param {Buffer} data
   * @param {(err?: Error) => void} callback
   * @param {{ opcode: number, fragmented: boolean, payloadLength: number }} info
   */
  parseControlFrame (callback, info) {
    assert(!info.fragmented)

    if (info.payloadLength > 125) {
      // Control frames can have a payload length of 125 bytes MAX
      callback(new Error('Payload length for control frame exceeded 125 bytes.'))
      return false
    } else if (this.#byteOffset < info.payloadLength) {
      callback()
      return false
    }

    const body = this.consume(info.payloadLength)

    if (info.opcode === opcodes.CLOSE) {
      if (info.payloadLength === 1) {
        failWebsocketConnection(this.ws, 'Received close frame with a 1-byte body.')
        return
      }

      this.#info.closeInfo = this.parseCloseBody(body)

      if (this.#info.closeInfo.error) {
        const { code, reason } = this.#info.closeInfo

        callback(new CloseEvent('close', { wasClean: false, reason, code }))
        return
      }

      if (this.ws[kSentClose] !== sentCloseFrameState.SENT) {
        // If an endpoint receives a Close frame and did not previously send a
        // Close frame, the endpoint MUST send a Close frame in response.  (When
        // sending a Close frame in response, the endpoint typically echos the
        // status code it received.)
        let body = emptyBuffer
        if (this.#info.closeInfo.code) {
          body = Buffer.allocUnsafe(2)
          body.writeUInt16BE(this.#info.closeInfo.code, 0)
        }
        const closeFrame = new WebsocketFrameSend(body)

        this.ws[kResponse].socket.write(
          closeFrame.createFrame(opcodes.CLOSE),
          (err) => {
            if (!err) {
              this.ws[kSentClose] = sentCloseFrameState.SENT
            }
          }
        )
      }

      // Upon either sending or receiving a Close control frame, it is said
      // that _The WebSocket Closing Handshake is Started_ and that the
      // WebSocket connection is in the CLOSING state.
      this.ws[kReadyState] = states.CLOSING
      this.ws[kReceivedClose] = true

      this.end()

      return
    } else if (info.opcode === opcodes.PING) {
      // Upon receipt of a Ping frame, an endpoint MUST send a Pong frame in
      // response, unless it already received a Close frame.
      // A Pong frame sent in response to a Ping frame must have identical
      // "Application data"

      if (!this.ws[kReceivedClose]) {
        const frame = new WebsocketFrameSend(body)

        this.ws[kResponse].socket.write(frame.createFrame(opcodes.PONG))

        if (channels.ping.hasSubscribers) {
          channels.ping.publish({
            payload: body
          })
        }
      }

      if (this.#byteOffset <= 0) {
        callback()
        return false
      }
    } else if (info.opcode === opcodes.PONG) {
      // A Pong frame MAY be sent unsolicited.  This serves as a
      // unidirectional heartbeat.  A response to an unsolicited Pong frame is
      // not expected.

      if (channels.pong.hasSubscribers) {
        channels.pong.publish({
          payload: body
        })
      }

      if (this.#byteOffset <= 0) {
        callback()
        return false
      }
    }

    return true
  }

  /**
   * Parses continuation frames.
   * @param {Buffer} data
   * @param {(err?: Error) => void} callback
   * @param {{ fin: boolean, fragmented: boolean, payloadLength: number }} info
   */
  parseContinuationFrame (callback, info) {
    // If we received a continuation frame before we started parsing another frame.
    if (this.#info.opcode === undefined) {
      callback(new Error('Received unexpected continuation frame.'))
      return false
    } else if (this.#byteOffset < info.payloadLength) {
      callback()
      return false
    }

    const body = this.consume(info.payloadLength)
    this.#fragments.push(body)

    // A fragmented message consists of a single frame with the FIN bit
    // clear and an opcode other than 0, followed by zero or more frames
    // with the FIN bit clear and the opcode set to 0, and terminated by
    // a single frame with the FIN bit set and an opcode of 0.
    if (info.fin) {
      const message = Buffer.concat(this.#fragments)
      websocketMessageReceived(this.ws, this.#info.opcode, message)
      this.#fragments.length = 0
      this.#info = {}
    }

    return true
  }

  get closingInfo () {
    return this.#info.closeInfo
  }
}

module.exports = {
  ByteParser
}
