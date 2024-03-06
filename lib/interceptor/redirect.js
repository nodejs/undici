'use strict'
const RedirectHandler = require('../handler/redirect-handler')

module.exports = opts => {
  const globalMaxRedirections = opts?.maxRedirections
  return dispatch => {
    return function redirectInterceptor (opts, handler) {
      const { maxRedirections = globalMaxRedirections } = opts

      if (!maxRedirections) {
        return dispatch(opts, handler)
      }

      const redirectHandler = new RedirectHandler(
        dispatch,
        maxRedirections,
        opts,
        handler
      )
      opts = { ...opts, maxRedirections: 0 } // Stop sub dispatcher from also redirecting.
      return dispatch(opts, redirectHandler)
    }
  }
}
