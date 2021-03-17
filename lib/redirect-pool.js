const { Readable } = require('stream')
const { pipeline, request, stream } = require('./agent')
const util = require('./core/util')
const Pool = require('./pool')

const kOrigin = Symbol('Origin')
const kDispatchMethod = Symbol('RedirectPoolDispatchMethod')
const kRedirectsLeft = Symbol('RedirectPoolRedirectsLeft')

const redirectCodes = [300, 301, 302, 303, 307, 308]
const defaultMaxRedirections = 10

class RedirectDiscardedResponse extends Readable {
  constructor(resume) {
    super({ autoDestroy: true, read: resume })
  }
}

class RedirectPool extends Pool {
  constructor(origin, options) {
    super(origin, options)

    this[kOrigin] = origin
  }

  request(opts, callback) {
    opts[kDispatchMethod] = 'request'

    return super.request(opts, callback)
  }

  stream(opts, factory, callback) {
    opts[kDispatchMethod] = 'stream'

    return super.stream(opts, factory, callback)
  }

  pipeline(opts, handler) {
    opts[kDispatchMethod] = 'pipeline'

    return super.pipeline(opts, handler)
  }

  dispatch(opts, handler) {
    const pool = this

    // Compute the number of left redirects, if needed
    if (!(kRedirectsLeft in opts)) {
      this.parseMaxRedirects(opts)
    }

    const originalOnHeaders = handler.onHeaders

    handler.onHeaders = function onHeadersWithRedirect(statusCode, headers, resume) {
      // Check if statusCode is 3xx, if there is a location header and if the redirection can be followed
      const location = pool.redirectLocation(statusCode, headers, opts)

      if (!location) {
        return originalOnHeaders.call(handler, statusCode, headers, resume, { redirections: opts.redirections })
      }

      // In case of HTTP 303, always replace method to be either HEAD or GET
      if (statusCode === 303 && opts.method !== 'HEAD') {
        if ('headers' in opts) {
          pool.removeHostSpecificHeaders(opts.headers)
        }

        opts.method = 'GET'
      }

      // Add the current URL to the list of redirects
      if (!opts.redirections) {
        opts.redirections = []
      }

      opts.redirections.push(`${pool[kOrigin]}${opts.path}`)

      // Update options
      opts.path = null
      opts[kRedirectsLeft]--

      // Follow the redirect
      switch (opts[kDispatchMethod]) {
        case 'request':
          request(location, opts, handler.callback)
          break
        case 'stream':
          stream(location, opts, handler.factory, handler.callback)
          break
        case 'pipeline':
          pipeline(location, handler.handler)
          break
      }

      // Ignore the body
      handler.onData = util.nop
      handler.onComplete = util.nop

      // Pause the current socket not to buffer the body (if any) at all
      return true
    }

    // Call the original implementation to proceed
    super.dispatch(opts, handler)
  }

  parseMaxRedirects(opts) {
    if (opts.maxRedirections === false) {
      opts[kRedirectsLeft] = -1
    } else if (
      opts.maxRedirections === true ||
      typeof opts.maxRedirections !== 'number' ||
      isNaN(opts.maxRedirections)
    ) {
      opts[kRedirectsLeft] = defaultMaxRedirections
    } else {
      opts[kRedirectsLeft] = opts.maxRedirections
    }
  }

  redirectLocation(statusCode, headers, opts) {
    if (opts[kRedirectsLeft] < 0 || redirectCodes.indexOf(statusCode) === -1) {
      return null
    }

    // Find the Location header and then the value
    const headerIndex = headers.findIndex(h => h.toLowerCase() === 'location')
    return headerIndex >= 0 ? headers[headerIndex + 1] : null
  }

  removeHostSpecificHeaders(headers) {
    if (Array.isArray(headers)) {
      for (let i = headers.length - 2; i >= 0; i -= 2) {
        const headerName = headers[i].toLowerCase()

        if (headerName === 'host' || headerName.indexOf('content-') === 0) {
          headers.splice(i, 2)
        }
      }
    } else {
      // IncomingHttpHeaders
      for (const rawHeaderName of Object.keys(headers)) {
        const headerName = rawHeaderName.toLowerCase()

        if (headerName === 'host' || headerName.indexOf('content-') === 0) {
          headers[rawHeaderName] = undefined
        }
      }
    }
  }
}

module.exports = RedirectPool
