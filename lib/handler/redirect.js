'use strict'

const { InvalidArgumentError } = require('../core/errors')
const util = require('../core/util')

class RedirectHandler {
  constructor (agent, opts, handler) {
    this.agent = agent
    this.location = null
    this.abort = null
    this.opts = opts
    this.handler = handler
  }

  onConnect (abort) {
    this.abort = abort
    this.handler.onConnect(abort)
  }

  onUpgrade (statusCode, headers, socket) {
    this.handler.onUpgrade(statusCode, headers, socket)
  }

  onError (error) {
    this.handler.onError(error)
  }

  onHeaders (statusCode, headers, resume) {
    if ([300, 301, 302, 303, 307, 308].indexOf(statusCode) === -1) {
      return this.handler.onHeaders(statusCode, headers, resume)
    }

    this.location = parseLocation(headers)

    if (!this.location) {
      return this.handler.onHeaders(statusCode, headers, resume)
    }

    const { origin, pathname, search } = util.parseURL(new URL(this.location, this.opts.origin))
    const path = search ? `${pathname}${search}` : pathname

    this.opts = { ...this.opts }

    this.opts.maxRedirections = this.opts.maxRedirections - 1
    // Remove headers referring to the original URL.
    // By default it is Host only, unless it's a 303 (see below), which removes also all Content-* headers.
    // https://tools.ietf.org/html/rfc7231#section-6.4
    this.opts.headers = cleanRequestHeaders(this.opts.headers, statusCode === 303)
    this.opts.path = path
    this.opts.origin = origin

    // https://tools.ietf.org/html/rfc7231#section-6.4.4
    // In case of HTTP 303, always replace method to be either HEAD or GET
    if (statusCode === 303 && this.opts.method !== 'HEAD') {
      this.opts.method = 'GET'
      this.opts.body = null
    }
  }

  onData (chunk) {
    if (this.location) {
      /*
        https://tools.ietf.org/html/rfc7231#section-6.4

        TLDR: undici always ignores 3xx response bodies.

        Redirection is used to serve the requested resource from another URL, so it is assumes that
        no body is generated (and thus can be ignored). Even though generating a body is not prohibited.

        For status 301, 302, 303, 307 and 308 (the latter from RFC 7238), the specs mention that the body usually
        (which means it's optional and not mandated) contain just an hyperlink to the value of
        the Location response header, so the body can be ignored safely.

        For status 300, which is "Multiple Choices", the spec mentions both generating a Location
        response header AND a response body with the other possible location to follow.
        Since the spec explicitily chooses not to specify a format for such body and leave it to
        servers and browsers implementors, we ignore the body as there is no specified way to eventually parse it.
      */
    } else {
      return this.handler.onData(chunk)
    }
  }

  onComplete (trailers) {
    if (this.location) {
      /*
        https://tools.ietf.org/html/rfc7231#section-6.4

        TLDR: undici always ignores 3xx response trailers as they are not expected in case of redirections
        and neither are useful if present.

        See comment on onData method above for more detailed informations.
      */

      this.agent.dispatch(this.opts, this.handler)
    } else {
      this.handler.onComplete(trailers)
    }
  }
}

function parseLocation (headers) {
  for (let i = 0; i < headers.length; i += 2) {
    if (headers[i].length === 8 && headers[i].toString().toLowerCase() === 'location') {
      return headers[i + 1]
    }
  }
}

// https://tools.ietf.org/html/rfc7231#section-6.4.4
function shouldRemoveHeader (header, removeContent) {
  return (
    (header.length === 4 && header.toString().toLowerCase() === 'host') ||
    (removeContent && header.toString().toLowerCase().indexOf('content-') === 0)
  )
}

// https://tools.ietf.org/html/rfc7231#section-6.4
function cleanRequestHeaders (headers, removeContent) {
  const ret = []
  if (Array.isArray(headers)) {
    for (let i = 0; i < headers.length; i += 2) {
      if (!shouldRemoveHeader(headers[i], removeContent)) {
        ret.push(headers[i], headers[i + 1])
      }
    }
  } else if (headers && typeof headers === 'object') {
    for (const [key, val] of Object.entries(headers)) {
      if (!shouldRemoveHeader(key, removeContent)) {
        ret.push(key, val)
      }
    }
  } else if (headers != null) {
    throw new InvalidArgumentError('headers must be an object or an array')
  }
  return ret
}

module.exports = RedirectHandler
