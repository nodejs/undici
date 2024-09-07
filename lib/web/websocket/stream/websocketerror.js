'use strict'

const { webidl } = require('../../fetch/webidl')
const { validateCloseCodeAndReason } = require('../util')

class WebSocketError extends DOMException {
  #closeCode
  #reason

  constructor (message = '', init = undefined) {
    message = webidl.converters.DOMString(message, 'WebSocketError', 'message')

    if (init !== null) {
      init = webidl.converters.WebSocketCloseInfo(init)
    }

    // 1. Set this 's name to " WebSocketError ".
    // 2. Set this 's message to message .
    super(message, 'WebSocketError')

    // 3. Let code be init [" closeCode "] if it exists , or null otherwise.
    let code = init.closeCode ?? null

    // 4. Let reason be init [" reason "] if it exists , or the empty string otherwise.
    const reason = init.reason ?? ''

    // 5. Validate close code and reason with code and reason .
    validateCloseCodeAndReason(code, reason)

    // 6. If reason is non-empty, but code is not set, then set code to 1000 ("Normal Closure").
    if (reason.length !== 0 && code === null) {
      code = 1000
    }

    // 7. Set this 's closeCode to code .
    this.#closeCode = code

    // 8. Set this 's reason to reason .
    this.#reason = reason
  }

  get closeCode () {
    return this.#closeCode
  }

  get reason () {
    return this.#reason
  }
}

module.exports = { WebSocketError }
