'use strict'

const { kReadyState, kController, kResponse } = require('./symbols')
const { states } = require('./constants')

/**
 * @param {import('./websocket').WebSocket} ws
 */
function isEstablished (ws) {
  // If the server's response is validated as provided for above, it is
  // said that _The WebSocket Connection is Established_ and that the
  // WebSocket Connection is in the OPEN state.
  return ws[kReadyState] === states.OPEN
}

/**
 * @param {import('./websocket').WebSocket} ws
 */
function isClosing (ws) {
  // Upon either sending or receiving a Close control frame, it is said
  // that _The WebSocket Closing Handshake is Started_ and that the
  // WebSocket connection is in the CLOSING state.
  return ws[kReadyState] === states.CLOSING
}

/**
 * @param {import('./websocket').WebSocket} ws
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
function fireEvent (e, target, eventConstructor = Event, eventInitDict) {
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

  for (const char of protocol) {
    const code = char.charCodeAt(0)

    if (
      code < 0x21 ||
      code > 0x7E ||
      char === '(' ||
      char === ')' ||
      char === '<' ||
      char === '>' ||
      char === '@' ||
      char === ',' ||
      char === ';' ||
      char === ':' ||
      char === '\\' ||
      char === '"' ||
      char === '/' ||
      char === '[' ||
      char === ']' ||
      char === '?' ||
      char === '=' ||
      char === '{' ||
      char === '}' ||
      code === 32 || // SP
      code === 9 // HT
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

/**
 * @param {import('./websocket').WebSocket} ws
 */
function failWebsocketConnection (ws) {
  const { [kController]: controller, [kResponse]: response } = ws

  controller.abort()

  if (response?.socket && !response.socket.destroyed) {
    response.socket.destroy()
  }
}

module.exports = {
  isEstablished,
  isClosing,
  isClosed,
  fireEvent,
  isValidSubprotocol,
  isValidStatusCode,
  failWebsocketConnection
}
