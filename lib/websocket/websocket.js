'use strict'

const { webidl } = require('../fetch/webidl')
const { hasOwn } = require('../fetch/util')
const { staticPropertyDescriptors } = require('./constants')
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

    throw new TypeError('not implemented')
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
