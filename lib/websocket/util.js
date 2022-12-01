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

module.exports = {
  isEstablished
}
