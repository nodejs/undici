'use strict'

const { kEnumerableProperty } = require('../../../core/util')
const { webidl } = require('../../fetch/webidl')
const { validateCloseCodeAndReason } = require('../util')

/**
 * @see https://whatpr.org/websockets/48/7b748d3...7b81f79.html#websocketerror
 */
class WebSocketError extends DOMException {
  /** @type {string} */
  #reason
  /** @type {number|null} */
  #closeCode = null

  /**
   * @param {string} message
   * @param {import('./websocketstream').WebSocketCloseInfo} init
   */
  constructor (message = '', init = {}) {
    super(message, 'WebSocketError')

    message = webidl.converters.DOMString(message)
    init = webidl.converters.WebSocketCloseInfo(init)

    // 1. Set this 's name to " WebSocketError ".
    // 2. Set this 's message to message .

    // 3. Let code be init [" closeCode "] if it exists , or null otherwise.
    let code = init.closeCode ?? null

    // 4. Let reason be init [" reason "] if it exists , or the empty string otherwise.
    const reason = init.reason

    // 5. Validate close code and reason with code and reason .
    validateCloseCodeAndReason(code, reason)

    // 6. If reason is non-empty, but code is not set, then set code to 1000 ("Normal Closure").
    if (reason.length) code ??= 1000

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

Object.defineProperties(WebSocketError.prototype, {
  closeCode: kEnumerableProperty,
  reason: kEnumerableProperty
})

webidl.converters.WebSocketCloseInfo = webidl.dictionaryConverter([
  {
    converter: webidl.nullableConverter((V) => webidl.converters['unsigned short'](V, { enforceRange: true })),
    key: 'closeCode'
  },
  {
    converter: webidl.converters.USVString,
    key: 'reason',
    defaultValue: ''
  }
])

module.exports = {
  WebSocketError
}
