'use strict'

const http = require('node:http')
const crypto = require('node:crypto')
const stream = require('node:stream')

const uid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

class ws {
  /**
   * @param {number} opcode
   * @param {Uint8Array} data
   */
  static createFrame (opcode, data) {
    const length = data.length

    let payloadLength = length
    let offset = 2

    if (length > 65535) {
      offset += 8
      payloadLength = 127
    } else if (length > 125) {
      offset += 2
      payloadLength = 126
    }

    const frame = Buffer.allocUnsafe(length + offset)

    frame[0] = 0x80 | opcode

    frame[1] = payloadLength

    if (payloadLength === 126) {
      frame.writeUInt16BE(length, 2)
    } else if (payloadLength === 127) {
      frame[2] = frame[3] = 0
      frame.writeUIntBE(length, 4, 6)
    }

    if (length !== offset) {
      frame.set(data, offset)
    }

    return frame
  }

  /**
   * @param {Uint8Array} buffer
   */
  static getHeadLength (buffer) {
    if (buffer.length < 2) {
      return null
    }
    const payloadLength = buffer[1] & 0x7f
    return (
      2 +
      (payloadLength === 126 ? 2 : payloadLength === 127 ? 8 : 0) +
      ((buffer[1] & 0x80) === 0x80 ? 4 : 0)
    )
  }

  /**
   * @param {Uint8Array} buffer
   */
  static parseFrame (buffer) {
    if (buffer.length < 2) {
      return null
    }

    const fin = (buffer[0] & 0x80) === 0x80
    const opcode = buffer[0] & 0x0f
    const masked = (buffer[1] & 0x80) === 0x80
    const payloadLength = buffer[1] & 0x7f
    const offset =
      6 + (payloadLength === 126 ? 2 : payloadLength === 127 ? 8 : 0)
    if (!fin || !masked) {
      throw new Error('Invalid frame')
    }

    if (buffer.length < offset) {
      return null
    }

    let length = 0
    if (payloadLength < 126) {
      length = payloadLength
    } else if (payloadLength === 126) {
      length |= buffer[2] << 8
      length |= buffer[3] << 0
    } else if (payloadLength === 127) {
      length |= buffer[2] << 56
      length |= buffer[3] << 48
      length |= buffer[4] << 40
      length |= buffer[5] << 32
      length |= buffer[6] << 24
      length |= buffer[7] << 16
      length |= buffer[8] << 8
      length |= buffer[9] << 0
    }

    return {
      opcode,
      length,
      offset,
      maskKey: buffer.subarray(offset - 4, offset),
      complete: buffer.length >= offset + length
    }
  }

  static Stream = class extends stream.Writable {
    #head = null
    #receivedLength = 0

    _write (chunk, _encoding, callback) {
      if (this.parseBody) {
        if (this.#head === null) {
          this.#head = chunk
        } else {
          this.#head = Buffer.concat([this.#head, chunk])
        }
        const head = this.#head
        const parsed = ws.parseFrame(head)
        if (parsed !== null) {
          if (parsed.complete) {
            const buffer = head.subarray(
              parsed.offset,
              parsed.offset + parsed.length
            )
            if (head.length > parsed.offset + parsed.length) {
              this.#head = head.subarray(
                parsed.offset + parsed.length,
                head.length
              )
            } else {
              this.#head = null
            }
            if (
              parsed.opcode === ws.opcode.TEXT ||
              parsed.opcode === ws.opcode.BINARY
            ) {
              this.onData({
                maskKey: parsed.maskKey,
                buffer,
                isBinary: parsed.opcode === ws.opcode.BINARY
              })
            } else if (parsed.opcode === ws.opcode.CLOSE) {
              this.onClose()
            } else {
              throw new Error('Unsupported frame opcode')
            }
          }
        }
      } else {
        let merged = false
        if (this.#head === null) {
          this.#head = chunk
        } else if (this.#head.length < 2) {
          this.#head = Buffer.concat([this.#head, chunk])
          merged = true
        } else {
          this.#receivedLength += chunk.length
        }
        const head = this.#head
        const size = ws.getHeadLength(head)
        if (size !== null) {
          const parsed = ws.parseFrame(head)
          if (parsed !== null) {
            const length = head.length + this.#receivedLength
            if (length >= parsed.offset + parsed.length) {
              if (length !== parsed.offset + parsed.length) {
                const start = length - (parsed.offset + parsed.length)
                if (chunk.length < start) {
                  if (merged) throw new Error('fatal error')
                  this.#head = Buffer.concat([this.#head, chunk]).subarray(
                    start
                  )
                } else {
                  this.#head = chunk.subarray(start)
                }
              } else {
                this.#head = null
              }
              this.#receivedLength = 0
              if (
                parsed.opcode === ws.opcode.TEXT ||
                parsed.opcode === ws.opcode.BINARY
              ) {
                this.onData({})
              } else if (parsed.opcode === ws.opcode.CLOSE) {
                this.onClose()
              } else {
                throw new Error('Unsupported frame opcode')
              }
            }
          }
        }
      }
      callback()
    }

    parseBody = true

    /**
     * @type {(...args: any[]) => void}
     */
    onData
    /**
     * @type {(...args: any[]) => void}
     */
    onClose
  }

  /**
   * @param {Uint8Array} buffer
   * @param {Uint8Array} mask
   * @returns {Uint8Array}
   */
  static unmask (buffer, mask) {
    const length = buffer.length
    const fixedLength = length - (length & 3)
    for (let i = 0; i < fixedLength; i += 4) {
      buffer[i] ^= mask[0]
      buffer[i + 1] ^= mask[1]
      buffer[i + 2] ^= mask[2]
      buffer[i + 3] ^= mask[3]
    }
    for (let i = fixedLength; i < length; ++i) {
      buffer[i] ^= mask[i & 3]
    }
    return buffer
  }

  static opcode = {
    CONTINUATION: 0x0,
    TEXT: 0x1,
    BINARY: 0x2,
    CLOSE: 0x8,
    PING: 0x9,
    PONG: 0xa
  }

  static Controller = class {
    #socket
    constructor (socket) {
      this.#socket = socket
    }

    write (buffer, isBinary) {
      return this.writeFrame(
        ws.createFrame(isBinary ? ws.opcode.BINARY : ws.opcode.TEXT, buffer)
      )
    }

    writeFrame (frame) {
      if (this.#socket.writable) {
        return new Promise((resolve, reject) => {
          this.#socket.write(frame, (err) => {
            if (err) {
              reject(err)
            } else {
              resolve()
            }
          })
        })
      }
    }

    async close () {
      if (this.#socket.writable) {
        await this.writeFrame(ws.createFrame(ws.opcode.CLOSE))
        this.#socket.end()
      }
    }

    /** @type {((...args: any[]) => void) | null} */
    onMessage
  }
}

/**
 * @param {{ onConnection: (ctrl: InstanceType<ws.controller>) => void; parseBody: boolean; }} param0
 */
function setup ({ onConnection, parseBody }) {
  const server = http.createServer((_req, res) => {
    res.end('')
  })

  server.on('upgrade', (req, socket, _head) => {
    const key = crypto
      .createHash('sha1')
      .update(`${req.headers['sec-websocket-key']}${uid}`)
      .digest('base64')

    socket.cork()
    socket.write('HTTP/1.1 101 Switching Protocols\r\n')
    socket.write('Upgrade: websocket\r\n')
    socket.write('Connection: Upgrade\r\n')
    socket.write('Sec-WebSocket-Version: 13\r\n')
    socket.write(`Sec-WebSocket-Accept: ${key}\r\n`)
    socket.write('\r\n')
    socket.uncork()

    const stream = new ws.Stream()
    const controller = new ws.Controller(socket)

    stream.onData = (data) => {
      if (typeof controller.onMessage === 'function') {
        controller.onMessage(data)
      }
    }

    stream.parseBody = !!(parseBody ?? true)

    stream.onClose = () => {
      socket.end()
    }

    stream.on('drain', () => {
      socket.resume()
    })

    socket.on('data', (buffer) => {
      if (!stream.write(buffer)) {
        socket.pause()
      }
    })

    socket.on('error', (err) => {
      stream.destroy(err)
    })

    socket.on('close', () => {
      stream.destroy()
    })

    onConnection(controller)
  })

  return server
}

module.exports = { setup, ws }
