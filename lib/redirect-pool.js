'use strict'

const { request, stream } = require('./agent')
const { InvalidArgumentError } = require('./core/errors')
const util = require('./core/util')
const Pool = require('./pool')

const kOrigin = Symbol('origin')
const kFollowedRedirections = Symbol('followed redirections')
const kLeftRedirections = Symbol('left redirections')

const redirectCodes = [300, 301, 302, 303, 307, 308]
const defaultMaxRedirections = 10

function parseMaxRedirections ({ maxRedirections = defaultMaxRedirections }) {
  if (maxRedirections != null && (maxRedirections <= 0 || !Number.isInteger(maxRedirections))) {
    throw new InvalidArgumentError('maxRedirections must be a positive number')
  }

  return maxRedirections
}

function redirectLocation (statusCode, headers, leftRedirections) {
  if (leftRedirections < 0 || redirectCodes.indexOf(statusCode) === -1) {
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
function shouldRemoveHeader (header, removeContent) {
  const lcHeader = header.toLowerCase()

  return lcHeader === 'host' || (removeContent && lcHeader.indexOf('content-') === 0)
}

// https://tools.ietf.org/html/rfc7231#section-6.4
function cleanRequestHeaders (headers, removeContent) {
  if (Array.isArray(headers)) {
    for (let i = headers.length - 2; i >= 0; i -= 2) {
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

class RedirectPool extends Pool {
  constructor (origin, options) {
    super(origin, options)

    this[kOrigin] = origin
  }

  dispatch (opts, handler) {
    const pool = this

    // Cannot use RedirectPool on pipelines
    if (handler.handler) {
      throw new InvalidArgumentError('RedirectPool cannot be used with pipeline')
    }

    if (util.isStream(opts.body)) {
      throw new InvalidArgumentError('body cannot be a stream when using RedirectPool')
    }

    const maxRedirections = parseMaxRedirections(opts)

    const redirectingHandler = {
      onConnect (abort) {
        handler.onConnect(abort)
      },

      onUpgrade (statusCode, headers, socket) {
        handler.onUpgrade(statusCode, headers, socket)
      },

      onError (error) {
        handler.onError(error)
      },

      onHeaders (statusCode, headers, resume) {
        let { [kLeftRedirections]: leftRedirections, [kFollowedRedirections]: followedRedirections } = opts

        if (typeof leftRedirections !== 'number') {
          leftRedirections = maxRedirections
        }

        // Check if statusCode is 3xx, if there is a location header and if the redirection can be followed
        const location = redirectLocation(statusCode, headers, leftRedirections)

        // Nothing to follow, use the original implementation
        if (!location) {
          return handler.onHeaders(statusCode, headers, resume, { redirections: followedRedirections })
        }

        // Gather other request options that will be modified
        let { method, headers: requestHeaders, body } = opts

        /*
          https://tools.ietf.org/html/rfc7231#section-6.4

          Remove headers referring to the original URL.
          By default it is Host only, unless it's a 303 (see below), which removes also all Content-* headers.
        */
        if (requestHeaders) {
          cleanRequestHeaders(requestHeaders, statusCode === 303)
        }

        // https://tools.ietf.org/html/rfc7231#section-6.4.4
        // In case of HTTP 303, always replace method to be either HEAD or GET
        if (statusCode === 303 && method !== 'HEAD') {
          method = 'GET'
          body = null
        }

        // Add the current URL to the list of redirects
        if (!Array.isArray(followedRedirections)) {
          followedRedirections = []
        }

        followedRedirections.push(`${pool[kOrigin]}${opts.path}`)

        // Prepare options for the next request
        const redirectedOpts = {
          ...opts,
          method,
          path: null,
          headers: requestHeaders,
          body,
          [kLeftRedirections]: leftRedirections - 1,
          [kFollowedRedirections]: followedRedirections
        }

        // Follow the redirect using same options - Note the top-level method must be used to support cross origin
        if (handler.factory) {
          // This is a StreamHandler
          stream(location, redirectedOpts, handler.factory, handler.callback)
        } else {
          request(location, redirectedOpts, handler.callback)
        }

        // Ignore the body
        redirectingHandler.onData = util.nop
        redirectingHandler.onComplete = util.nop

        // Pause the current socket not to buffer the body (if any) at all
        return true
      },

      onData (chunk) {
        return handler.onData(chunk)
      },

      onComplete (trailers) {
        handler.onComplete(trailers)
      }
    }

    // Call the original implementation with the new handler to proceed
    super.dispatch(opts, redirectingHandler)
  }
}

function redirectPoolFactory (origin, opts) {
  return new RedirectPool(origin, opts)
}

module.exports = {
  redirectPoolFactory,
  RedirectPool
}
