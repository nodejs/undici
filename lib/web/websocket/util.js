'use strict'

const { kReadyState, kController, kResponse, kBinaryType, kWebSocketURL, kSentClose, kPromises } = require('./symbols')
const { states, opcodes, emptyBuffer } = require('./constants')
const { MessageEvent, ErrorEvent } = require('./events')
const { WebsocketFrameSend } = require('./frame')

/* globals Blob */

/**
 * @param {import('./websocket').WebSocket} ws
 * @returns {boolean}
 */
function isConnecting (ws) {
  // If the WebSocket connection is not yet established, and the connection
  // is not yet closed, then the WebSocket connection is in the CONNECTING state.
  return ws[kReadyState] === states.CONNECTING
}

/**
 * @param {import('./websocket').WebSocket} ws
 * @returns {boolean}
 */
function isEstablished (ws) {
  // If the server's response is validated as provided for above, it is
  // said that _The WebSocket Connection is Established_ and that the
  // WebSocket Connection is in the OPEN state.
  return ws[kReadyState] === states.OPEN
}

/**
 * @param {import('./websocket').WebSocket} ws
 * @returns {boolean}
 */
function isClosing (ws) {
  // Upon either sending or receiving a Close control frame, it is said
  // that _The WebSocket Closing Handshake is Started_ and that the
  // WebSocket connection is in the CLOSING state.
  return ws[kReadyState] === states.CLOSING
}

/**
 * @param {import('./websocket').WebSocket} ws
 * @returns {boolean}
 */
function isClosed (ws) {
  return ws[kReadyState] === states.CLOSED
}

/**
 * @see https://dom.spec.whatwg.org/#concept-event-fire
 * @param {string} e
 * @param {EventTarget} target
 * @param {EventInit | undefined} eventInitDict
 */
function fireEvent (e, target, eventConstructor = Event, eventInitDict = {}) {
  // TODO: remove this
  if (!target.dispatchEvent) return

  // 1. If eventConstructor is not given, then let eventConstructor be Event.

  // 2. Let event be the result of creating an event given eventConstructor,
  //    in the relevant realm of target.
  // 3. Initialize event’s type attribute to e.
  const event = new eventConstructor(e, eventInitDict) // eslint-disable-line new-cap

  // 4. Initialize any other IDL attributes of event as described in the
  //    invocation of this algorithm.

  // 5. Return the result of dispatching event at target, with legacy target
  //    override flag set if set.
  target.dispatchEvent(event)
}

const textDecoder = new TextDecoder('utf-8', { fatal: true })

/**
 * @see https://websockets.spec.whatwg.org/#feedback-from-the-protocol
 * @param {import('./websocket').WebSocket} ws
 * @param {number} type Opcode
 * @param {Buffer} data application data
 */
function websocketMessageReceived (ws, type, data) {
  // TODO: remove
  if (!ws.dispatchEvent) return

  // 1. If ready state is not OPEN (1), then return.
  if (ws[kReadyState] !== states.OPEN) {
    return
  }

  // 2. Let dataForEvent be determined by switching on type and binary type:
  let dataForEvent

  if (type === opcodes.TEXT) {
    // -> type indicates that the data is Text
    //      a new DOMString containing data
    try {
      dataForEvent = textDecoder.decode(data)
    } catch {
      failWebsocketConnection(ws, 'Received invalid UTF-8 in text frame.')
      return
    }
  } else if (type === opcodes.BINARY) {
    if (ws[kBinaryType] === 'blob') {
      // -> type indicates that the data is Binary and binary type is "blob"
      //      a new Blob object, created in the relevant Realm of the WebSocket
      //      object, that represents data as its raw data
      dataForEvent = new Blob([data])
    } else {
      // -> type indicates that the data is Binary and binary type is "arraybuffer"
      //      a new ArrayBuffer object, created in the relevant Realm of the
      //      WebSocket object, whose contents are data
      dataForEvent = new Uint8Array(data).buffer
    }
  }

  // 3. Fire an event named message at the WebSocket object, using MessageEvent,
  //    with the origin attribute initialized to the serialization of the WebSocket
  //    object’s url's origin, and the data attribute initialized to dataForEvent.
  fireEvent('message', ws, MessageEvent, {
    origin: ws[kWebSocketURL].origin,
    data: dataForEvent
  })
}

/**
 * @see https://datatracker.ietf.org/doc/html/rfc6455
 * @see https://datatracker.ietf.org/doc/html/rfc2616
 * @see https://bugs.chromium.org/p/chromium/issues/detail?id=398407
 * @param {string} protocol
 */
function isValidSubprotocol (protocol) {
  // If present, this value indicates one
  // or more comma-separated subprotocol the client wishes to speak,
  // ordered by preference.  The elements that comprise this value
  // MUST be non-empty strings with characters in the range U+0021 to
  // U+007E not including separator characters as defined in
  // [RFC2616] and MUST all be unique strings.
  if (protocol.length === 0) {
    return false
  }

  for (let i = 0; i < protocol.length; ++i) {
    const code = protocol.charCodeAt(i)

    if (
      code < 0x21 || // CTL, contains SP (0x20) and HT (0x09)
      code > 0x7E ||
      code === 0x22 || // "
      code === 0x28 || // (
      code === 0x29 || // )
      code === 0x2C || // ,
      code === 0x2F || // /
      code === 0x3A || // :
      code === 0x3B || // ;
      code === 0x3C || // <
      code === 0x3D || // =
      code === 0x3E || // >
      code === 0x3F || // ?
      code === 0x40 || // @
      code === 0x5B || // [
      code === 0x5C || // \
      code === 0x5D || // ]
      code === 0x7B || // {
      code === 0x7D // }
    ) {
      return false
    }
  }

  return true
}

/**
 * @see https://datatracker.ietf.org/doc/html/rfc6455#section-7-4
 * @param {number} code
 */
function isValidStatusCode (code) {
  if (code >= 1000 && code < 1015) {
    return (
      code !== 1004 && // reserved
      code !== 1005 && // "MUST NOT be set as a status code"
      code !== 1006 // "MUST NOT be set as a status code"
    )
  }

  return code >= 3000 && code <= 4999
}

/** @type {import('./stream/websocketerror').WebSocketError} */
let WebSocketError

/**
 * @param {import('./websocket').WebSocket} ws
 * @param {string|undefined} reason
 */
function failWebsocketConnection (ws, reason) {
  const { [kController]: controller, [kResponse]: response } = ws

  controller.abort()

  if (response?.socket && !response.socket.destroyed) {
    response.socket.destroy()
  }

  if (reason) {
    // TODO: process.nextTick
    fireEvent('error', ws, ErrorEvent, {
      error: new Error(reason)
    })
  }

  if (ws[kPromises]) {
    WebSocketError ??= require('./stream/websocketerror').WebSocketError

    const error = new WebSocketError('Connection closed.', { reason })

    ws[kPromises].opened.reject(error)
    ws[kPromises].closed.reject(error)
  }
}

/**
 * @see https://whatpr.org/websockets/48/7b748d3...7b81f79.html#close-the-websocket
 * @param {import('./websocket').WebSocket|import('./stream/websocketstream').WebSocketStream} object
 * @param {number|null} code
 * @param {string} reason
 */
function closeWebSocket (object, code = null, reason = '') {
  // 1.  If code was not supplied, let code be null.
  // 2.  If reason was not supplied, let reason be the empty string.

  // 3.  Validate close code and reason with code and reason .
  validateCloseCodeAndReason(code, reason)

  // 4.  Run the first matching steps from the following list:
  //     - If object ’s ready state is CLOSING (2) or CLOSED (3)
  //     - If the WebSocket connection is not yet established [WSP]
  //     - If the WebSocket closing handshake has not yet been started [WSP]
  //     - Otherwise
  if (object[kReadyState] === states.CLOSING || object[kReadyState] === states.CLOSED) {
    // Do nothing.
    // I like this step.
  } else if (!isEstablished(object)) {
    // Fail the WebSocket connection and set object ’s ready state to CLOSING (2). [WSP]
    // TODO: with reason?
    failWebsocketConnection(object, reason)
    object[kReadyState] = states.CLOSING
  } else if (!isClosing(object)) {
    // Start the WebSocket closing handshake and set object ’s ready state to CLOSING (2). [WSP]
    // -  If code is null and reason is the empty string, the WebSocket Close frame must not have a body.
    // -  if reason is non-empty but code is null, then set code to 1000 ("Normal Closure").
    // -  If code is set, then the status code to use in the WebSocket Close frame must be the integer given by code . [WSP]
    // -  If reason is non-empty, then reason , encoded as UTF-8 , must be provided in the Close frame after the status code. [WSP]

    if (reason.length && code === null) {
      code = 1000
    }

    const frame = new WebsocketFrameSend()

    if (code !== null && reason.length === 0) {
      frame.frameData = Buffer.allocUnsafe(2)
      frame.frameData.writeUInt16BE(code, 0)
    } else if (code !== null && reason.length) {
      frame.frameData = Buffer.allocUnsafe(2 + Buffer.byteLength(reason))
      frame.frameData.writeUInt16BE(code, 0)
      frame.frameData.write(reason, 2, 'utf-8')
    } else {
      frame.frameData = emptyBuffer
    }

    /** @type {import('stream').Duplex} */
    const socket = object[kResponse].socket

    socket.write(frame.createFrame(opcodes.CLOSE), (err) => {
      if (!err) {
        object[kSentClose] = true
      }
    })

    // Upon either sending or receiving a Close control frame, it is said
    // that _The WebSocket Closing Handshake is Started_ and that the
    // WebSocket connection is in the CLOSING state.
    object[kReadyState] = states.CLOSING
  } else {
    //  Set object ’s ready state to CLOSING (2).
    object[kReadyState] = states.CLOSING
  }
}

/**
 * @see https://whatpr.org/websockets/48/7b748d3...7b81f79.html#validate-close-code-and-reason
 * @param {number|null} code
 * @param {any} reason
 */
function validateCloseCodeAndReason (code, reason) {
  // 1.  If code is not null, but is neither an integer equal to 1000 nor an integer in the
  //     range 3000 to 4999, inclusive, throw an " InvalidAccessError " DOMException .
  if (code !== null && code !== 1000 && (code < 3000 || code > 4999)) {
    throw new DOMException('Invalid code', 'InvalidAccessError')
  }

  // 2.  If reason is not null, then:
  // TODO: reason can't be null here?
  if (reason) {
    // 2.1.  Let reasonBytes be the result of UTF-8 encoding reason .
    const reasonBytes = new TextEncoder().encode(reason)

    // 2.2.  If reasonBytes is longer than 123 bytes, then throw a " SyntaxError " DOMException .
    if (reasonBytes.length > 123) {
      throw new DOMException(
        `Reason must be less than 123 bytes; received ${Buffer.byteLength(reasonBytes)}`,
        'SyntaxError'
      )
    }
  }
}

/**
 * @see https://whatpr.org/websockets/48/7b748d3...7b81f79.html#get-a-url-record
 * @param {URL|string} url
 * @param {URL|string|undefined} baseURL
 */
function getURLRecord (url, baseURL) {
  // 1. Let urlRecord be the result of applying the URL parser to url with baseURL .
  /** @type {URL} */
  let urlRecord

  try {
    urlRecord = new URL(url, baseURL)
  } catch (e) {
    // 2. If urlRecord is failure, then throw a " SyntaxError " DOMException .
    throw new DOMException(e, 'SyntaxError')
  }

  // 3. If urlRecord ’s scheme is " http ", then set urlRecord ’s scheme to " ws ".
  // 4. Otherwise, if urlRecord ’s scheme is " https ", set urlRecord ’s scheme to " wss ".
  if (urlRecord.protocol === 'http:') {
    urlRecord.protocol = 'ws:'
  } else if (urlRecord.protocol === 'https:') {
    urlRecord.protocol = 'wss:'
  }

  // 5. If urlRecord ’s scheme is not " ws " or " wss ", then throw a " SyntaxError " DOMException .
  if (urlRecord.protocol !== 'ws:' && urlRecord.protocol !== 'wss:') {
    throw new DOMException(
      `Expected a ws: or wss: protocol, got ${urlRecord.protocol}`,
      'SyntaxError'
    )
  }

  // 6. If urlRecord ’s fragment is non-null, then throw a " SyntaxError " DOMException .
  if (urlRecord.hash || urlRecord.href.endsWith('#')) {
    throw new DOMException('Got fragment', 'SyntaxError')
  }

  // 7. Return urlRecord .
  return urlRecord
}

module.exports = {
  isConnecting,
  isEstablished,
  isClosing,
  isClosed,
  fireEvent,
  isValidSubprotocol,
  isValidStatusCode,
  failWebsocketConnection,
  websocketMessageReceived,
  closeWebSocket,
  validateCloseCodeAndReason,
  getURLRecord
}
