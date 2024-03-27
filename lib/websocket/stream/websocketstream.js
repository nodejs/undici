'use strict'

const { webidl } = require('../../fetch/webidl')
const { kEnumerableProperty } = require('../../core/util')
const { getGlobalOrigin } = require('../../fetch/global')
const {
  isValidSubprotocol,
  isEstablished,
  failWebsocketConnection,
  closeWebSocket,
  getURLRecord,
  isClosing
} = require('../util')
const { kReadyState, kResponse, kByteParser, kController, kPromises } = require('../symbols')
const { states, opcodes } = require('../constants')
const { establishWebSocketConnection } = require('../connection')
const { ByteParser } = require('../receiver')
const { createDeferredPromise } = require('../../fetch/util')
const { WebSocketError } = require('./websocketerror')
const { WebsocketFrameSend } = require('../frame')

/**
 * @typedef {Object} WebSocketOpenInfo
 * @property {ReadableStream} readable
 * @property {WritableStream} writable
 * @property {string} extensions DOMString
 */

/**
 * @typedef {Object} WebSocketCloseInfo
 * @property {number} closeCode [EnforceRange] unsigned short
 * @property {string} reason USVString
 */

class WebSocketStream {
  /** @type {URL} */
  #internalURL

  #handshakeAborted = false
  #wasEverConnected = false

  #readableStream
  #writableStream

  constructor (url, options = {}) {
    webidl.argumentLengthCheck(arguments, 1, { header: 'WebSocketStream constructor' })

    url = webidl.converters.USVString(url)
    options = webidl.converters.WebSocketStreamOptions(options)

    this[kReadyState] = states.CONNECTING
    this[kResponse] = null

    // 1.  Let baseURL be this 's relevant settings object 's API base URL .
    const baseURL = getGlobalOrigin()

    // 2.  Let urlRecord be the result of getting a URL record given url and baseURL .
    const urlRecord = getURLRecord(url, baseURL)

    // 3.  Let protocols be options [" protocols "] if it exists , otherwise an
    //     empty sequence.
    const protocols = options.protocols ?? []

    // 4.  If any of the values in protocols occur more than once or otherwise fail to match
    //     the requirements for elements that comprise the value of ` Sec-WebSocket-Protocol `
    //     fields as defined by The WebSocket Protocol , then throw a " SyntaxError "
    //     DOMException . [WSP]
    if (protocols.length !== new Set(protocols.map(p => p.toLowerCase())).size) {
      throw new DOMException('Invalid Sec-WebSocket-Protocol value', 'SyntaxError')
    }

    if (protocols.length > 0 && !protocols.every(p => isValidSubprotocol(p))) {
      throw new DOMException('Invalid Sec-WebSocket-Protocol value', 'SyntaxError')
    }

    // 5.  Set this 's url to urlRecord .
    this.#internalURL = urlRecord.toString()

    // 6.  Set this 's opened promise and closed promise to new promises.
    this[kPromises] = { opened: createDeferredPromise(), closed: createDeferredPromise() }

    // 7.  Apply backpressure to the WebSocket.
    // Note: this is done in the duplex stream for us

    // 8.  If options [" signal "] exists ,
    if (options.signal != null) {
      // 8.1.  Let signal be options [" signal "].
      /** @type {AbortSignal} */
      const signal = options.signal

      // 8.2.  If signal is aborted , then reject this 's opened promise and closed
      //       promise with signal ’s abort reason and return.
      if (signal.aborted) {
        this[kPromises].opened.reject(signal.reason)
        this[kPromises].closed.reject(signal.reason)
        return
      }

      // 8.3.  Add the following abort steps to signal :
      signal.addEventListener('abort', () => {
        // 8.3.1.  If the WebSocket connection is not yet established : [WSP]
        if (!isEstablished(this)) {
          // 8.3.1.1.  Fail the WebSocket connection .
          failWebsocketConnection(this)

          // 8.3.1.2.  Set this 's ready state to CLOSING .
          this[kReadyState] = states.CLOSING

          // 8.3.1.3.  Reject this 's opened promise and closed promise with signal ’s
          //           abort reason .
          this[kPromises].opened.reject(signal.reason)
          this[kPromises].closed.reject(signal.reason)

          // 8.3.1.4.  Set this 's handshake aborted to true.
          this.#handshakeAborted = true
        }
      }, { once: true })
    }

    // 9.  Let client be this 's relevant settings object .
    // 10.  Run this step in parallel :
    // 10.1.  Establish a WebSocket connection given urlRecord , protocols , and client . [FETCH]
    this[kController] = establishWebSocketConnection(
      urlRecord,
      protocols,
      this,
      (response) => this.#onConnectionEstablished(response),
      options
    )
  }

  /**
   * @returns {string}
   */
  get url () {
    return this.#internalURL
  }

  /**
   * @returns {Promise<WebSocketOpenInfo>}
   */
  get opened () {
    webidl.brandCheck(this, WebSocketStream)

    return this[kPromises].opened.promise
  }

  /**
   * @returns {Promise<WebSocketCloseInfo>}
   */
  get closed () {
    webidl.brandCheck(this, WebSocketStream)

    return this[kPromises].closed.promise
  }

  /**
   * @see https://whatpr.org/websockets/48/7b748d3...7b81f79.html#dom-websocketstream-close
   * @param {WebSocketCloseInfo|undefined} closeInfo
   * @returns {void}
   */
  close (closeInfo) {
    webidl.brandCheck(this, WebSocketStream)

    closeInfo = webidl.converters.WebSocketCloseInfo(closeInfo)

    // 1.  Let code be closeInfo [" closeCode "] if present, or null otherwise.
    const code = closeInfo.closeCode

    // 2.  Let reason be closeInfo [" reason "].
    const reason = closeInfo.reason

    // 3.  Close the WebSocket with this , code , and reason .
    closeWebSocket(this, code, reason)
  }

  /**
   * @see https://whatpr.org/websockets/48/7b748d3...7b81f79.html#the-websocketstream-interface
   */
  #onConnectionEstablished (response) {
    // processResponse is called when the "response’s header list has been received and initialized."
    // once this happens, the connection is open
    this[kResponse] = response

    const parser = new ByteParser(this)
    parser.on('drain', function onParserDrain () {
      this.ws[kResponse].socket.resume()
    })

    response.socket.ws = this
    this[kByteParser] = parser

    // 1.  Change the ready state to OPEN (1).
    this[kReadyState] = states.OPEN

    // 2.  Set stream ’s was ever connected to true.
    this.#wasEverConnected = true

    // 3.  Let extensions be the extensions in use .
    const extensions = response.headersList.get('sec-websocket-extensions') ?? ''

    // 4.  Let protocol be the subprotocol in use .
    const protocol = response.headersList.get('sec-websocket-protocol') ?? ''

    // 5.  Let pullAlgorithm be an action that pulls bytes from stream .
    // 6.  Let cancelAlgorithm be an action that cancels the WebSocketStream with stream and
    //     reason , given reason .
    // 7.  Let readable be a new ReadableStream .
    // 8.  Set up readable with pullAlgorithm and cancelAlgorithm .
    const readable = new ReadableStream({
      pull (controller) {
        // TODO: do we read until the queue is empty?
        let chunk
        while ((chunk = response.socket.read()) !== null) {
          controller.enqueue(chunk)
        }
      },
      cancel: (reason) => this.#cancel(reason)
    }, new ByteLengthQueuingStrategy({ highWaterMark: 16384 }))

    // 9.  Let writeAlgorithm be an action that writes chunk to stream , given chunk .
    // 10.  Let closeAlgorithm be an action that closes stream .
    // 11.  Let abortAlgorithm be an action that aborts stream with reason , given reason .
    // 12.  Let writable be a new WritableStream .
    // 13.  Set up writable with writeAlgorithm , closeAlgorithm , and abortAlgorithm .
    const writable = new WritableStream({
      write: (chunk) => this.#write(chunk),
      close: () => closeWebSocket(this),
      abort: (reason) => this.#closeWithReason(reason)
    }, new ByteLengthQueuingStrategy({ highWaterMark: 16384 }))

    // 14.  Set stream ’s readable stream to readable .
    this.#readableStream = readable

    // 15.  Set stream ’s writable stream to writable .
    this.#writableStream = writable

    // 16.  Resolve stream ’s opened promise with WebSocketOpenInfo
    //      «[ " extensions " → extensions , " protocol " → protocol , " readable " → readable , "
    //         writable " → writable ]».
    this[kPromises].opened.resolve({
      extensions,
      protocol,
      readable,
      writable
    })
  }

  /**
   * @see https://whatpr.org/websockets/48/7b748d3...7b81f79.html#cancel
   * @param {any} reason
   */
  #cancel (reason) {
    //  To cancel a WebSocketStream stream given reason , close using reason giving stream and reason .
    this.#closeWithReason(reason)
  }

  /**
   * @see https://whatpr.org/websockets/48/7b748d3...7b81f79.html#close-using-reason
   * @param {any} reason
   */
  #closeWithReason (reason) {
    // 1.  Let code be null.
    let code = null

    // 2.  Let reasonString be the empty string.
    let reasonString = ''

    // 3.  If reason implements WebSocketError ,
    if (reason instanceof WebSocketError) {
      // 3.1.  Set code to reason ’s closeCode .
      code = reason.closeCode

      // 3.2.  Set reasonString to reason ’s reason .
      reasonString = reason.reason
    }

    // 4.  Close the WebSocket with stream , code , and reasonString . If this throws an exception,
    //     discard code and reasonString and close the WebSocket with stream .
    closeWebSocket(this, code, reasonString)
  }

  /**
   * @see https://whatpr.org/websockets/48/7b748d3...7b81f79.html#write
   * @param {any} chunk
   */
  #write (chunk) {
    // 1.  Let promise be a new promise created in stream ’s relevant realm .

    let data
    let opcode

    // 2.  If chunk is a BufferSource ,
    if (webidl.is.BufferSource(chunk)) {
      // 2.1.  Let data be a copy of the bytes given chunk .
      data = Buffer.from(chunk, chunk.byteOffset, chunk.byteLength)

      // 2.2.  Let opcode be a binary frame opcode.
      opcode = opcodes.BINARY
    } else {
      // 3.  Otherwise,

      // 3.1.  Let string be the result of converting chunk to an IDL USVString .
      //       If this throws an exception, return a promise rejected with the exception.
      // 3.2.  Let data be the result of UTF-8 encoding string .
      data = new TextEncoder().encode(webidl.converters.USVString(chunk))

      // 3.3.  Let opcode be a text frame opcode.
      opcode = opcodes.TEXT
    }

    // 4.  In parallel,
    // 4.1.  Wait until there is sufficient buffer space in stream to send the message.
    // 4.2.  If the closing handshake has not yet started , Send a WebSocket Message to
    //       stream comprised of data using opcode .
    // 4.3.  Queue a global task on the WebSocket task source given stream ’s relevant
    //       global object to resolve promise with undefined.
    if (!isClosing(this)) {
      const frame = new WebsocketFrameSend(data)
      const buffer = frame.createFrame(opcode)

      this[kResponse].socket.write(buffer, () => {
        // TODO: what if error?
      })
    }

    // 5.  Return promise .
  }
}

Object.defineProperties(WebSocketStream.prototype, {
  url: kEnumerableProperty,
  opened: kEnumerableProperty,
  closed: kEnumerableProperty,
  close: kEnumerableProperty,
  [Symbol.toStringTag]: {
    value: 'WebSocketStream',
    configurable: true
  }
})

webidl.converters['sequence<USVString>'] = webidl.sequenceConverter(
  webidl.converters.USVString
)

webidl.converters.WebSocketStreamOptions = webidl.dictionaryConverter([
  {
    key: 'protocols',
    converter: webidl.converters['sequence<USVString>']
  },
  {
    key: 'signal',
    converter: webidl.converters.AbortSignal
  }
])

module.exports = {
  WebSocketStream
}
