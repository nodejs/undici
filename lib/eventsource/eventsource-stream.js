'use strict'
const { Transform } = require('node:stream')
const { BOM, CR, LF, COLON, SPACE } = require('./constants')
const { isASCIINumber, isValidLastEventId } = require('./util')

/**
 * @typedef {object} EventSourceStreamEvent
 * @type {object}
 * @property {string} [event] The event type.
 * @property {string} [data] The data of the message.
 * @property {string} [id] A unique ID for the event.
 * @property {string} [retry] The reconnection time, in milliseconds.
 */

/**
 * @typedef EventSourceState
 * @type {object}
 * @property {string} lastEventId The last event ID received from the server.
 * @property {string} origin The origin of the event source.
 * @property {number} reconnectionTime The reconnection time, in milliseconds.
 */

class EventSourceStream extends Transform {
  /**
   * @type {EventSourceState}
   */
  state = null

  /**
   * Leading byte-order-mark check.
   * @type {boolean}
   */
  checkBOM = true

  /**
   * @type {boolean}
   */
  crlfCheck = false

  /**
   * @type {boolean}
   */
  eventEndCheck = false

  /**
   * @type {Buffer}
   */
  buffer = null

  pos = 0

  event = {
    data: undefined,
    event: undefined,
    id: undefined,
    retry: undefined
  }

  /**
   * @param {object} options
   * @param {EventSourceState} options.eventSourceState
   * @param {Function} [options.push]
   */
  constructor (options = {}) {
    options.readableObjectMode = true
    super(options)
    this.state = options.eventSourceState
    if (options.push) {
      this.push = options.push
    }
  }

  /**
   * @param {Buffer} chunk
   * @param {string} _encoding
   * @param {Function} callback
   * @returns {void}
   */
  _transform (chunk, _encoding, callback) {
    if (chunk.length === 0) {
      callback()
      return
    }

    // We cache the chunk in the buffer, as the data might not be complete
    // while processing it
    if (this.buffer) {
      this.buffer = Buffer.concat([this.buffer, chunk])
    } else {
      this.buffer = chunk
    }

    // Strip leading byte-order-mark if we opened the stream and started
    // the processing of the incoming data
    if (this.checkBOM) {
      switch (this.buffer.length) {
        case 1:
          // Check if the first byte is the same as the first byte of the BOM
          if (this.buffer[0] === BOM[0]) {
            // If it is, we need to wait for more data
            callback()
            return
          }
          // Set the checkBOM flag to false as we don't need to check for the
          // BOM anymore
          this.checkBOM = false

          // The buffer only contains one byte so we need to wait for more data
          callback()
          return
        case 2:
          // Check if the first two bytes are the same as the first two bytes
          // of the BOM
          if (
            this.buffer[0] === BOM[0] &&
            this.buffer[1] === BOM[1]
          ) {
            // If it is, we need to wait for more data, because the third byte
            // is needed to determine if it is the BOM or not
            callback()
            return
          }

          // Set the checkBOM flag to false as we don't need to check for the
          // BOM anymore
          this.checkBOM = false
          break
        case 3:
          // Check if the first three bytes are the same as the first three
          // bytes of the BOM
          if (
            this.buffer[0] === BOM[0] &&
            this.buffer[1] === BOM[1] &&
            this.buffer[2] === BOM[2]
          ) {
            // If it is, we can drop the buffered data, as it is only the BOM
            this.buffer = Buffer.alloc(0)
            // Set the checkBOM flag to false as we don't need to check for the
            // BOM anymore
            this.checkBOM = false

            // Await more data
            callback()
            return
          }
          // If it is not the BOM, we can start processing the data
          this.checkBOM = false
          break
        default:
          // The buffer is longer than 3 bytes, so we can drop the BOM if it is
          // present
          if (
            this.buffer[0] === BOM[0] &&
            this.buffer[1] === BOM[1] &&
            this.buffer[2] === BOM[2]
          ) {
            // Remove the BOM from the buffer
            this.buffer = this.buffer.subarray(3)
          }

          // Set the checkBOM flag to false as we don't need to check for the
          this.checkBOM = false
          break
      }
    }

    while (this.pos < this.buffer.length) {
      if (this.buffer[this.pos] === LF || this.buffer[this.pos] === CR) {
        if (this.eventEndCheck) {
          this.eventEndCheck = false
          this.processEvent(this.event)
          this.event = {
            data: undefined,
            event: undefined,
            id: undefined,
            retry: undefined
          }
          this.buffer = this.buffer.slice(1)
          continue
        }
        if (this.buffer[0] === COLON) {
          this.buffer = this.buffer.slice(1)
          continue
        }
        this.parseLine(this.buffer.slice(0, this.pos), this.event)

        // Remove the processed line from the buffer
        this.buffer = this.buffer.slice(this.pos)
        // Reset the position
        this.pos = 0
        this.eventEndCheck = true
        continue
      }
      this.pos++
    }

    callback()
  }

  /**
   * @param {Buffer} line
   * @param {EventSourceStreamEvent} event
   */
  parseLine (line, event) {
    if (line.length === 0) {
      return
    }

    const fieldNameEnd = line.indexOf(COLON)
    if (fieldNameEnd === -1) {
      return
    }

    let fieldValueStart = fieldNameEnd + 1
    if (line[fieldValueStart] === SPACE) {
      fieldValueStart += 1
    }

    const fieldValueSize = line.length - fieldValueStart
    const fieldName = line.slice(0, fieldNameEnd).toString('utf8')
    switch (fieldName) {
      case 'data':
        event.data = line.slice(fieldValueStart, fieldValueStart + fieldValueSize).toString('utf8')
        break
      case 'event':
        event.event = line.slice(fieldValueStart, fieldValueStart + fieldValueSize).toString('utf8')
        break
      case 'id':
        event.id = line.slice(fieldValueStart, fieldValueStart + fieldValueSize).toString('utf8')
        break
      case 'retry':
        event.retry = line.slice(fieldValueStart, fieldValueStart + fieldValueSize).toString('utf8')
        break
    }
  }

  /**
   * @param {EventSourceStreamEvent} event
   */
  processEvent (event) {
    if (event.retry) {
      if (isASCIINumber(event.retry)) {
        this.state.reconnectionTime = parseInt(event.retry, 10)
      }
    }
    const {
      id,
      data = null,
      event: type = 'message'
    } = event

    if (id && isValidLastEventId(id)) {
      this.state.lastEventId = id
    }

    this.push({
      type,
      payload: {
        data,
        lastEventId: this.state.lastEventId,
        origin: this.state.origin
      }
    })
  }
}

module.exports = {
  EventSourceStream
}
