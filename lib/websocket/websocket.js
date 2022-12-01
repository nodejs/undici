'use strict'

const { webidl } = require('../fetch/webidl')
const { hasOwn, isValidHTTPToken } = require('../fetch/util')
const { DOMException } = require('../fetch/constants')
const { URLSerializer } = require('../fetch/dataURL')
const { staticPropertyDescriptors } = require('./constants')
const { kWebSocketURL } = require('./symbols')
const { establishWebSocketConnection } = require('./connection')
const { kEnumerableProperty, isBlobLike } = require('../core/util')
const { types } = require('util')

// https://websockets.spec.whatwg.org/#interface-definition
class WebSocket extends EventTarget {
  /**
   * @param {string} url
   * @param {string|string[]} protocols
   */
  constructor (url, protocols = []) {
    super()

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
    establishWebSocketConnection(urlRecord, protocols)
  }

  /**
   * @see https://websockets.spec.whatwg.org/#dom-websocket-close
   * @param {number} code
   * @param {string} reason
   */
  close (code, reason) {
    webidl.brandCheck(this, WebSocket)

    code = webidl.converters['unsigned short'](code, { clamp: true })
    reason = webidl.converters.USVString(reason)

    throw new TypeError('not implemented')
  }

  /**
   * @see https://websockets.spec.whatwg.org/#dom-websocket-send
   * @param {NodeJS.TypedArray|ArrayBuffer|Blob|string} data
   */
  send (data) {
    webidl.brandCheck(this, WebSocket)

    data = webidl.converters.WebSocketSendData(data)

    throw new TypeError('not implemented')
  }

  get readyState () {
    webidl.brandCheck(this, WebSocket)

    throw new TypeError('not implemented')
  }

  get bufferedAmount () {
    webidl.brandCheck(this, WebSocket)

    throw new TypeError('not implemented')
  }

  get url () {
    webidl.brandCheck(this, WebSocket)

    // The url getter steps are to return this's url, serialized.
    return URLSerializer(this[kWebSocketURL])
  }

  get extensions () {
    webidl.brandCheck(this, WebSocket)

    throw new TypeError('not implemented')
  }

  get protocol () {
    webidl.brandCheck(this, WebSocket)

    throw new TypeError('not implemented')
  }

  get onopen () {
    webidl.brandCheck(this, WebSocket)

    throw new TypeError('not implemented')
  }

  set onopen (fn) {
    webidl.brandCheck(this, WebSocket)

    throw new TypeError('not implemented')
  }

  get onerror () {
    webidl.brandCheck(this, WebSocket)

    throw new TypeError('not implemented')
  }

  set onerror (fn) {
    webidl.brandCheck(this, WebSocket)

    throw new TypeError('not implemented')
  }

  get onclose () {
    webidl.brandCheck(this, WebSocket)

    throw new TypeError('not implemented')
  }

  set onclose (fn) {
    webidl.brandCheck(this, WebSocket)

    throw new TypeError('not implemented')
  }

  get onmessage () {
    webidl.brandCheck(this, WebSocket)

    throw new TypeError('not implemented')
  }

  set onmessage (fn) {
    webidl.brandCheck(this, WebSocket)

    throw new TypeError('not implemented')
  }

  get binaryType () {
    webidl.brandCheck(this, WebSocket)

    throw new TypeError('not implemented')
  }

  set binaryType (type) {
    webidl.brandCheck(this, WebSocket)

    throw new TypeError('not implemented')
  }
}

// https://websockets.spec.whatwg.org/#dom-websocket-connecting
WebSocket.CONNECTING = WebSocket.prototype.CONNECTING = 0
// https://websockets.spec.whatwg.org/#dom-websocket-open
WebSocket.OPEN = WebSocket.prototype.OPEN = 1
// https://websockets.spec.whatwg.org/#dom-websocket-closing
WebSocket.CLOSING = WebSocket.prototype.CLOSING = 2
// https://websockets.spec.whatwg.org/#dom-websocket-closed
WebSocket.CLOSED = WebSocket.prototype.CLOSED = 3

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

    if (
      ArrayBuffer.isView(V) ||
      types.isAnyArrayBuffer(V)
    ) {
      return webidl.converters.BufferSource(V)
    }
  }

  return webidl.converters.USVString(V)
}

module.exports = {
  WebSocket
}
