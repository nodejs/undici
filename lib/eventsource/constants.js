'use strict'

/**
 * A reconnection time, in milliseconds. This must initially be an implementation-defined value,
 * probably in the region of a few seconds.
 *
 * In Comparison:
 * - Chrome uses 3000ms.
 * - Deno uses 5000ms.
 */
const defaultReconnectionTime = 3000

/**
 * The readyState attribute represents the state of the connection.
 * @enum
 * @readonly
 * @see https://html.spec.whatwg.org/multipage/server-sent-events.html#dom-eventsource-readystate-dev
 */

/**
 * The connection has not yet been established, or it was closed and the user
 * agent is reconnecting.
 * @type {0}
 */
const CONNECTING = 0

/**
 * The user agent has an open connection and is dispatching events as it
 * receives them.
 * @type {1}
 */
const OPEN = 1

/**
 * The connection is not open, and the user agent is not trying to reconnect.
 * @type {2}
 */
const CLOSED = 2

/**
 * Requests for the element will have their mode set to "cors" and their credentials mode set to "same-origin".
 * @type {'anonymous'}
 */
const ANONYMOUS = 'anonymous'

/**
 * Requests for the element will have their mode set to "cors" and their credentials mode set to "include".
 * @type {'use-credentials'}
 */
const USE_CREDENTIALS = 'use-credentials'

/**
 * @type {number[]} BOM
 */
const BOM = [0xEF, 0xBB, 0xBF]
/**
 * @type {10} LF
 */
const LF = 0x0A
/**
 * @type {13} CR
 */
const CR = 0x0D
/**
 * @type {58} COLON
 */
const COLON = 0x3A
/**
 * @type {32} SPACE
 */
const SPACE = 0x20

module.exports = {
  defaultReconnectionTime,
  CONNECTING,
  OPEN,
  CLOSED,
  BOM,
  LF,
  CR,
  COLON,
  SPACE,
  ANONYMOUS,
  USE_CREDENTIALS
}
