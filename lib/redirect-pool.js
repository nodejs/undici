'use strict'

const { Readable } = require('stream')
const { pipeline, request, stream } = require('./agent')
const { InvalidArgumentError } = require('./core/errors')
const util = require('./core/util')
const Pool = require('./pool')

const kOrigin = Symbol('origin')
const kLeftRedirections = Symbol('left redirections')

const redirectCodes = [300, 301, 302, 303, 307, 308]
const defaultMaxRedirections = 10

function parseMaxRedirections({ maxRedirections = defaultMaxRedirections }) {
  if (maxRedirections != null && (maxRedirections <= 0 || !Number.isInteger(maxRedirections))) {
    throw new InvalidArgumentError('maxRedirections must be a positive number')
  }

  return maxRedirections
}

function redirectLocation(statusCode, headers, opts) {
  if (opts[kLeftRedirections] < 0 || redirectCodes.indexOf(statusCode) === -1) {
    return null
  }

  for (let i = 0; i < headers.length; i += 2) {
    // Find the matching headers, then return its value
    if (headers[i].length && headers[i].toLowerCase() === 'location') {
      return headers[i + 1]
    }
  }

  return null
}

// https://tools.ietf.org/html/rfc7231#section-6.4.4
function shouldRemoveHeader(header, removeContent) {
  const lcHeader = header.toLowerCase()

  return lcHeader === 'host' || (removeContent && lcHeader.indexOf('content-') === 0)
}

// https://tools.ietf.org/html/rfc7231#section-6.4
function cleanRequestHeaders(headers, removeContent) {
  if (Array.isArray(headers)) {
    for (let i = headers.length - 2; i >= 0; i -= 2) {
      const headerName = headers[i].toLowerCase()

      if (shouldRemoveHeader(headers[i], removeContent)) {
        headers.splice(i, 2)
      }
    }
  } else {
    // IncomingHttpHeaders
    for (const header of Object.keys(headers)) {
      if (shouldRemoveHeader(header, removeContent)) {
        headers[header] = undefined
      }
    }
  }
}

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

  dispatch(opts, handler) {
    const pool = this

    // Compute the number of left redirects, if needed
    if (!(kLeftRedirections in opts)) {
      opts[kLeftRedirections] = parseMaxRedirections(opts)
    }

    const originalOnHeaders = handler.onHeaders

    handler.onHeaders = function onHeadersWithRedirect(statusCode, headers, resume) {
      // Check if statusCode is 3xx, if there is a location header and if the redirection can be followed
      const location = redirectLocation(statusCode, headers, opts)

      // Nothing to follow, use the original implementation
      if (!location) {
        return originalOnHeaders.call(handler, statusCode, headers, resume, { redirections: opts.redirections })
      }

      /*
        https://tools.ietf.org/html/rfc7231#section-6.4

        Remove headers referring to the original URL.
        By default it is Host only, unless it's a 303 (see below), which removes also all Content-* headers.
      */
      if ('headers' in opts) {
        cleanRequestHeaders(opts.headers, statusCode === 303)
      }

      // https://tools.ietf.org/html/rfc7231#section-6.4.4
      // In case of HTTP 303, always replace method to be either HEAD or GET
      if (statusCode === 303 && opts.method !== 'HEAD') {
        opts.method = 'GET'
      }

      // Add the current URL to the list of redirects
      if (!opts.redirections) {
        opts.redirections = []
      }

      opts.redirections.push(`${pool[kOrigin]}${opts.path}`)

      // Update options
      opts.path = null
      opts[kLeftRedirections]--

      // Follow the redirect
      switch (opts.requestType) {
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
}

function redirectPoolFactory(origin, opts) {
  return new RedirectPool(origin, opts)
}

module.exports = {
  redirectPoolFactory,
  RedirectPool
}
