'use strict'

const RedirectHandler = require('../handler/redirect-handler')

function createRedirectInterceptor ({ maxRedirections: defaultMaxRedirections, throwOnMaxRedirections: defaultThrowOnMaxRedirections } = {}) {
  return (dispatch) => {
    return function Intercept (opts, handler) {
      const { maxRedirections = defaultMaxRedirections, throwOnMaxRedirections = defaultThrowOnMaxRedirections, ...rest } = opts

      if (maxRedirections == null || maxRedirections === 0) {
        return dispatch(opts, handler)
      }

      const dispatchOpts = { ...rest } // Stop sub dispatcher from also redirecting.
      const redirectHandler = new RedirectHandler(dispatch, maxRedirections, { throwOnMaxRedirections, ...dispatchOpts }, handler)
      return dispatch(dispatchOpts, redirectHandler)
    }
  }
}

module.exports = createRedirectInterceptor
