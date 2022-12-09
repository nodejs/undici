'use strict'

const { kReadyState } = require('./symbols')
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

/*! ws. MIT License. Einar Otto Stangvik <einaros@gmail.com> */
/**
 * Checks if a given buffer contains only correct UTF-8.
 * Ported from https://www.cl.cam.ac.uk/%7Emgk25/ucs/utf8_check.c by
 * Markus Kuhn.
 *
 * @param {Buffer|Uint8Array} buf The buffer to check
 * @return {boolean} `true` if `buf` contains only correct UTF-8, else `false`
 */
function isValidUTF8 (buf) {
  const len = buf.length
  let i = 0

  while (i < len) {
    if ((buf[i] & 0x80) === 0) {
      // 0xxxxxxx
      i++
    } else if ((buf[i] & 0xe0) === 0xc0) {
      // 110xxxxx 10xxxxxx
      if (
        i + 1 === len ||
        (buf[i + 1] & 0xc0) !== 0x80 ||
        (buf[i] & 0xfe) === 0xc0 // Overlong
      ) {
        return false
      }

      i += 2
    } else if ((buf[i] & 0xf0) === 0xe0) {
      // 1110xxxx 10xxxxxx 10xxxxxx
      if (
        i + 2 >= len ||
        (buf[i + 1] & 0xc0) !== 0x80 ||
        (buf[i + 2] & 0xc0) !== 0x80 ||
        (buf[i] === 0xe0 && (buf[i + 1] & 0xe0) === 0x80) || // Overlong
        (buf[i] === 0xed && (buf[i + 1] & 0xe0) === 0xa0) // Surrogate (U+D800 - U+DFFF)
      ) {
        return false
      }

      i += 3
    } else if ((buf[i] & 0xf8) === 0xf0) {
      // 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx
      if (
        i + 3 >= len ||
        (buf[i + 1] & 0xc0) !== 0x80 ||
        (buf[i + 2] & 0xc0) !== 0x80 ||
        (buf[i + 3] & 0xc0) !== 0x80 ||
        (buf[i] === 0xf0 && (buf[i + 1] & 0xf0) === 0x80) || // Overlong
        (buf[i] === 0xf4 && buf[i + 1] > 0x8f) ||
        buf[i] > 0xf4 // > U+10FFFF
      ) {
        return false
      }

      i += 4
    } else {
      return false
    }
  }

  return true
}

module.exports = {
  isEstablished,
  isClosing,
  isClosed,
  fireEvent,
  isValidSubprotocol,
  isValidStatusCode,
  isValidUTF8
}
