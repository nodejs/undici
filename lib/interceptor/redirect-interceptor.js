'use strict'

const RedirectHandler = require('../handler/redirect-handler')

function createRedirectInterceptor ({ maxRedirections: defaultMaxRedirections }) {
  return (dispatch) => {
    return function Intercept (opts, handler, onDrain) {
      const { maxRedirections = defaultMaxRedirections } = opts

      if (!maxRedirections) {
        return dispatch(opts, handler, onDrain)
      }

      const redirectHandler = new RedirectHandler(dispatch, maxRedirections, opts, handler)
      opts = { ...opts, maxRedirections: 0 } // Stop sub dispatcher from also redirecting.
      return dispatch(opts, redirectHandler, onDrain)
    }
  }
}

module.exports = createRedirectInterceptor
