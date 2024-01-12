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
    this.buffer = this.buffer ? Buffer.concat([this.buffer, chunk]) : chunk

    // Strip leading byte-order-mark if any
    if (this.checkBOM) {
      switch (this.buffer.length) {
        case 1:
          if (this.buffer[0] === BOM[0]) {
            callback()
            return
          }
          this.checkBOM = false
          break
        case 2:
          if (this.buffer[0] === BOM[0] && this.buffer[1] === BOM[1]) {
            callback()
            return
          }
          this.checkBOM = false
          break
        case 3:
          if (this.buffer[0] === BOM[0] && this.buffer[1] === BOM[1] && this.buffer[2] === BOM[2]) {
            this.buffer = this.buffer.slice(3)
            this.checkBOM = false
            callback()
            return
          }
          this.checkBOM = false
          break
        default:
          if (this.buffer[0] === BOM[0] && this.buffer[1] === BOM[1] && this.buffer[2] === BOM[2]) {
            this.buffer = this.buffer.slice(3)
          }
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
        this.buffer = this.buffer.slice(this.pos + 1)
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
    let fieldValueStart

    if (fieldNameEnd === -1) {
      return
      // fieldNameEnd = line.length;
      // fieldValueStart = line.length;
    }
    fieldValueStart = fieldNameEnd + 1
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
