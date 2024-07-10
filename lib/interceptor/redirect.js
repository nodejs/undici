'use strict'

const RedirectHandler = require('../handler/redirect-handler')

function createRedirectInterceptor ({ maxRedirections: defaultMaxRedirections } = {}) {
  return (dispatch) => {
    return function Intercept (opts, handler) {
      const { maxRedirections = defaultMaxRedirections, ...rest } = opts

      if (maxRedirections == null) {
        return dispatch(opts, handler)
      }

      const redirectHandler = new RedirectHandler(dispatch, maxRedirections, opts, handler)
      const dispatchOpts = { ...rest, maxRedirections: 0 } // Stop sub dispatcher from also redirecting.
      return dispatch(dispatchOpts, redirectHandler)
    }
  }
}

module.exports = createRedirectInterceptor
