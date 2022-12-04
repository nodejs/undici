'use strict'

const { webidl } = require('../fetch/webidl')
const { hasOwn, isValidHTTPToken } = require('../fetch/util')
const { DOMException } = require('../fetch/constants')
const { URLSerializer } = require('../fetch/dataURL')
const { staticPropertyDescriptors, states, opcodes } = require('./constants')
const {
  kWebSocketURL,
  kReadyState,
  kController,
  kExtensions,
  kProtocol,
  kBinaryType,
  kResponse
} = require('./symbols')
const { isEstablished, isClosing } = require('./util')
const { establishWebSocketConnection, failWebsocketConnection, WebsocketFrame } = require('./connection')
const { kEnumerableProperty, isBlobLike } = require('../core/util')
const { types } = require('util')

// https://websockets.spec.whatwg.org/#interface-definition
class WebSocket extends EventTarget {
  #events = {
    open: null,
    error: null,
    close: null,
    message: null
  }

  #bufferedAmount = 0

  /**
   * @param {string} url
   * @param {string|string[]} protocols
   */
  constructor (url, protocols = []) {
    super()

    webidl.argumentLengthCheck(arguments, 1, { header: 'WebSocket constructor' })

    url = webidl.converters.USVString(url)
    protocols = webidl.converters['DOMString or sequence<DOMString>'](protocols)

    // 1. Let urlRecord be the result of applying the URL parser to url.
    let urlRecord

    try {
      urlRecord = new URL(url)
    } catch (e) {
      // 2. If urlRecord is failure, then throw a "SyntaxError" DOMException.
      throw new DOMException(e, 'SyntaxError')
    }

    // 3. If urlRecord’s scheme is not "ws" or "wss", then throw a
    //    "SyntaxError" DOMException.
    if (urlRecord.protocol !== 'ws:' && urlRecord.protocol !== 'wss:') {
      throw new DOMException(
        `Expected a ws: or wss: protocol, got ${urlRecord.protocol}`,
        'SyntaxError'
      )
    }

    // 4. If urlRecord’s fragment is non-null, then throw a "SyntaxError"
    //    DOMException.
    if (urlRecord.hash) {
      throw new DOMException('Got fragment', 'SyntaxError')
    }

    // 5. If protocols is a string, set protocols to a sequence consisting
    //    of just that string.
    if (typeof protocols === 'string') {
      if (protocols.length === 0) {
        protocols = []
      } else {
        protocols = [protocols]
      }
    }

    // 6. If any of the values in protocols occur more than once or otherwise
    //    fail to match the requirements for elements that comprise the value
    //    of `Sec-WebSocket-Protocol` fields as defined by The WebSocket
    //    protocol, then throw a "SyntaxError" DOMException.
    if (protocols.length !== new Set(protocols.map(p => p.toLowerCase())).size) {
      throw new DOMException('Invalid Sec-WebSocket-Protocol value', 'SyntaxError')
    }

    if (protocols.length > 0 && !protocols.every(p => isValidHTTPToken(p))) {
      throw new DOMException('Invalid Sec-WebSocket-Protocol value', 'SyntaxError')
    }

    // 7. Set this's url to urlRecord.
    this[kWebSocketURL] = urlRecord

    // 8. Let client be this's relevant settings object.

    // 9. Run this step in parallel:

    //    1. Establish a WebSocket connection given urlRecord, protocols,
    //       and client.
    this[kController] = establishWebSocketConnection(urlRecord, protocols, this)

    // Each WebSocket object has an associated ready state, which is a
    // number representing the state of the connection. Initially it must
    // be CONNECTING (0).
    this[kReadyState] = WebSocket.CONNECTING

    // The extensions attribute must initially return the empty string.
    this[kExtensions] = ''

    // The protocol attribute must initially return the empty string.
    this[kProtocol] = ''

    // Each WebSocket object has an associated binary type, which is a
    // BinaryType. Initially it must be "blob".
    this[kBinaryType] = 'blob'
  }

  /**
   * @see https://websockets.spec.whatwg.org/#dom-websocket-close
   * @param {number|undefined} code
   * @param {string|undefined} reason
   */
  close (code = undefined, reason = undefined) {
    webidl.brandCheck(this, WebSocket)

    if (code !== undefined) {
      code = webidl.converters['unsigned short'](code, { clamp: true })
    }

    if (reason !== undefined) {
      reason = webidl.converters.USVString(reason)
    }

    // 1. If code is present, but is neither an integer equal to 1000 nor an
    //    integer in the range 3000 to 4999, inclusive, throw an
    //    "InvalidAccessError" DOMException.
    if (code !== undefined) {
      if (code !== 1000 && (code < 3000 || code > 4999)) {
        throw new DOMException('invalid code', 'InvalidAccessError')
      }
    }

    // 2. If reason is present, then run these substeps:
    if (reason !== undefined) {
      // 1. Let reasonBytes be the result of encoding reason.
      // 2. If reasonBytes is longer than 123 bytes, then throw a
      //    "SyntaxError" DOMException.
      const byteLength = Buffer.byteLength(reason)

      if (byteLength > 123) {
        throw new DOMException(
          `Reason must be less than 123 bytes; received ${byteLength}`,
          'SyntaxError'
        )
      }
    }

    /* eslint-disable no-constant-condition */
    // 3. Run the first matching steps from the following list:
    if (this[kReadyState] === WebSocket.CLOSING || this[kReadyState] === WebSocket.CLOSED) {
      // If this's ready state is CLOSING (2) or CLOSED (3)
      // Do nothing.
    } else if (!isEstablished(this)) {
      // If the WebSocket connection is not yet established
      // Fail the WebSocket connection and set this's ready state
      // to CLOSING (2).
      failWebsocketConnection(this[kController])
      this[kReadyState] = WebSocket.CLOSING
    } else if (0) { // TODO
      // If the WebSocket closing handshake has not yet been started
      // Start the WebSocket closing handshake and set this's ready
      // state to CLOSING (2).
      // - If neither code nor reason is present, the WebSocket Close
      //   message must not have a body.
      // - If code is present, then the status code to use in the
      //   WebSocket Close message must be the integer given by code.
      // - If reason is also present, then reasonBytes must be
      //   provided in the Close message after the status code.
    } else {
      // Otherwise
      // Set this's ready state to CLOSING (2).
      this[kReadyState] = WebSocket.CLOSING
    }
    /* eslint-enable no-constant-condition */
  }

  /**
   * @see https://websockets.spec.whatwg.org/#dom-websocket-send
   * @param {NodeJS.TypedArray|ArrayBuffer|Blob|string} data
   */
  send (data) {
    webidl.brandCheck(this, WebSocket)

    webidl.argumentLengthCheck(arguments, 1, { header: 'WebSocket.send' })

    data = webidl.converters.WebSocketSendData(data)

    // 1. If this's ready state is CONNECTING, then throw an
    //    "InvalidStateError" DOMException.
    if (this[kReadyState] === WebSocket.CONNECTING) {
      throw new DOMException('Sent before connected.', 'InvalidStateError')
    }

    // 2. Run the appropriate set of steps from the following list:
    // https://datatracker.ietf.org/doc/html/rfc6455#section-6.1
    // https://datatracker.ietf.org/doc/html/rfc6455#section-5.2

    // If data is a string
    if (typeof data === 'string') {
      // If the WebSocket connection is established and the WebSocket
      // closing handshake has not yet started, then the user agent
      // must send a WebSocket Message comprised of the data argument
      // using a text frame opcode; if the data cannot be sent, e.g.
      // because it would need to be buffered but the buffer is full,
      // the user agent must flag the WebSocket as full and then close
      // the WebSocket connection. Any invocation of this method with a
      // string argument that does not throw an exception must increase
      // the bufferedAmount attribute by the number of bytes needed to
      // express the argument as UTF-8.
      if (isEstablished(this) && !isClosing(this)) {
        const socket = this[kResponse].socket
        const frame = new WebsocketFrame()
        // 1. set FIN to true. TODO: support fragmentation later.
        frame.FIN = true
        // 2. enable masking
        frame.isMasked = true
        // 3. set mask key
        frame.maskKey = Buffer.alloc(4)
        for (let i = 0; i < 4; i++) {
          frame.maskKey[i] = Math.floor(Math.random() * 256)
        }

        // TODO: support BINARY data
        frame.opcode = opcodes.TEXT
        frame.payloadData = Buffer.from(data)

        socket.write(frame.toBuffer())
      }
    }
  }

  get readyState () {
    webidl.brandCheck(this, WebSocket)

    // The readyState getter steps are to return this's ready state.
    return this[kReadyState]
  }

  get bufferedAmount () {
    webidl.brandCheck(this, WebSocket)

    return this.#bufferedAmount
  }

  get url () {
    webidl.brandCheck(this, WebSocket)

    // The url getter steps are to return this's url, serialized.
    return URLSerializer(this[kWebSocketURL])
  }

  get extensions () {
    webidl.brandCheck(this, WebSocket)

    return this[kExtensions]
  }

  get protocol () {
    webidl.brandCheck(this, WebSocket)

    return this[kProtocol]
  }

  get onopen () {
    webidl.brandCheck(this, WebSocket)

    return this.#events.open
  }

  set onopen (fn) {
    webidl.brandCheck(this, WebSocket)

    if (this.#events.open) {
      this.removeEventListener('open', this.#events.open)
    }

    if (typeof fn === 'function') {
      this.#events.open = fn
      this.addEventListener('open', fn)
    } else {
      this.#events.open = null
    }
  }

  get onerror () {
    webidl.brandCheck(this, WebSocket)

    return this.#events.error
  }

  set onerror (fn) {
    webidl.brandCheck(this, WebSocket)

    if (this.#events.error) {
      this.removeEventListener('error', this.#events.error)
    }

    if (typeof fn === 'function') {
      this.#events.error = fn
      this.addEventListener('error', fn)
    } else {
      this.#events.error = null
    }
  }

  get onclose () {
    webidl.brandCheck(this, WebSocket)

    return this.#events.close
  }

  set onclose (fn) {
    webidl.brandCheck(this, WebSocket)

    if (this.#events.close) {
      this.removeEventListener('close', this.#events.close)
    }

    if (typeof fn === 'function') {
      this.#events.close = fn
      this.addEventListener('close', fn)
    } else {
      this.#events.close = null
    }
  }

  get onmessage () {
    webidl.brandCheck(this, WebSocket)

    return this.#events.message
  }

  set onmessage (fn) {
    webidl.brandCheck(this, WebSocket)

    if (this.#events.message) {
      this.removeEventListener('message', this.#events.message)
    }

    if (typeof fn === 'function') {
      this.#events.message = fn
      this.addEventListener('message', fn)
    } else {
      this.#events.message = null
    }
  }

  get binaryType () {
    webidl.brandCheck(this, WebSocket)

    return this[kBinaryType]
  }

  set binaryType (type) {
    webidl.brandCheck(this, WebSocket)

    if (type !== 'blob' && type !== 'arraybuffer') {
      this[kBinaryType] = 'blob'
    } else {
      this[kBinaryType] = type
    }
  }
}

// https://websockets.spec.whatwg.org/#dom-websocket-connecting
WebSocket.CONNECTING = WebSocket.prototype.CONNECTING = states.CONNECTING
// https://websockets.spec.whatwg.org/#dom-websocket-open
WebSocket.OPEN = WebSocket.prototype.OPEN = states.OPEN
// https://websockets.spec.whatwg.org/#dom-websocket-closing
WebSocket.CLOSING = WebSocket.prototype.CLOSING = states.CLOSING
// https://websockets.spec.whatwg.org/#dom-websocket-closed
WebSocket.CLOSED = WebSocket.prototype.CLOSED = states.CLOSED

Object.defineProperties(WebSocket.prototype, {
  CONNECTING: staticPropertyDescriptors,
  OPEN: staticPropertyDescriptors,
  CLOSING: staticPropertyDescriptors,
  CLOSED: staticPropertyDescriptors,
  url: kEnumerableProperty,
  readyState: kEnumerableProperty,
  bufferedAmount: kEnumerableProperty,
  onopen: kEnumerableProperty,
  onerror: kEnumerableProperty,
  onclose: kEnumerableProperty,
  close: kEnumerableProperty,
  onmessage: kEnumerableProperty,
  binaryType: kEnumerableProperty,
  send: kEnumerableProperty,
  extensions: kEnumerableProperty,
  protocol: kEnumerableProperty,
  [Symbol.toStringTag]: {
    value: 'WebSocket',
    writable: false,
    enumerable: false,
    configurable: true
  }
})

Object.defineProperties(WebSocket, {
  CONNECTING: staticPropertyDescriptors,
  OPEN: staticPropertyDescriptors,
  CLOSING: staticPropertyDescriptors,
  CLOSED: staticPropertyDescriptors
})

webidl.converters['sequence<DOMString>'] = webidl.sequenceConverter(
  webidl.converters.DOMString
)

webidl.converters['DOMString or sequence<DOMString>'] = function (V) {
  if (webidl.util.Type(V) === 'Object' && hasOwn(V, Symbol.iterator)) {
    return webidl.converters['sequence<DOMString>'](V)
  }

  return webidl.converters.DOMString(V)
}

webidl.converters.WebSocketSendData = function (V) {
  if (webidl.util.Type(V) === 'Object') {
    if (isBlobLike(V)) {
      return webidl.converters.Blob(V, { strict: false })
    }

    if (ArrayBuffer.isView(V) || types.isAnyArrayBuffer(V)) {
      return webidl.converters.BufferSource(V)
    }
  }

  return webidl.converters.USVString(V)
}

module.exports = {
  WebSocket
}
