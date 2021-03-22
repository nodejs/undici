const util = require('./core/util')
const { InvalidArgumentError } = require('./core/errors')

function dispatch (origin, agent, { maxRedirections = 10, ...opts }, handler) {
  if (maxRedirections != null && (maxRedirections < 0 || !Number.isInteger(maxRedirections))) {
    throw new InvalidArgumentError('maxRedirections must be a positive number')
  }

  const client = agent.get(origin)

  if (!maxRedirections) {
    return client.dispatch(opts, handler)
  }

  // TODO (fix): Restartable streams?
  if (util.isStream(opts.body) && util.bodyLength(opts.body) !== 0) {
    return client.dispatch(opts, handler)
  }

  client.dispatch(opts, {
    agent,
    opts: { ...opts, maxRedirections: maxRedirections - 1 },
    origin,
    maxRedirections,
    handler,
    location: null,

    onConnect (abort) {
      this.onConnect(abort)
    },

    onUpgrade (statusCode, headers, socket) {
      this.onUpgrade(statusCode, headers, socket)
    },

    onError (error) {
      this.onError(error)
    },

    onHeaders (statusCode, headers, resume) {
      // Check if statusCode is 3xx, if there is a location header and if the redirection can be followed
      this.location = this.maxRedirections
        ? redirectLocation(statusCode, headers)
        : null

      if (!this.location) {
        return this.handler.onHeaders(statusCode, headers, resume)
      }

      this.location = new URL(this.location, this.origin)

      // Remove headers referring to the original URL.
      // By default it is Host only, unless it's a 303 (see below), which removes also all Content-* headers.
      // https://tools.ietf.org/html/rfc7231#section-6.4
      this.opts.headers = cleanRequestHeaders(this.opts.headers, statusCode === 303)

      // https://tools.ietf.org/html/rfc7231#section-6.4.4
      // In case of HTTP 303, always replace method to be either HEAD or GET
      if (statusCode === 303) {
        this.opts.method = 'GET'
        // TOOD (fix): What if body?
      }
    },

    onData (chunk) {
      if (!this.location) {
        return this.handler.onData(chunk)
      }
    },

    onComplete (trailers) {
      if (this.location) {
        dispatch(this.location, this.opts, this.handler, this.agent)
      } else {
        this.handler.onComplete(trailers)
      }
    }
  })
}

function redirectLocation (statusCode, headers) {
  // TODO (fix): Different redirect codes are handled differently?
  if ([300, 301, 302, 303, 307, 308].indexOf(statusCode) === -1) {
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
  return (
    (header.length === 4 && header.toLowerCase() === 'host') ||
    (removeContent && header.toLowerCase().indexOf('content-') === 0)
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

function dispatchWithRedirectAgent (fn) {
  return (url, { agent, method = 'GET', ...opts } = {}, ...additionalArgs) => {
    if (opts.path != null) {
      throw new InvalidArgumentError('unsupported opts.path')
    }

    const { origin, pathname, search } = util.parseURL(url)

    const path = `${pathname || '/'}${search || ''}`

    return fn.call({ dispatch: dispatch.bind(null, origin, agent) }, { ...opts, method, path }, ...additionalArgs)
  }
}

module.exports = {
  request: dispatchWithRedirectAgent(require('./client-request')),
  stream: dispatchWithRedirectAgent(require('./client-stream')),
  pipeline: dispatchWithRedirectAgent(require('./client-pipeline')),
  connect: dispatchWithRedirectAgent(require('./client-connect')),
  upgrade: dispatchWithRedirectAgent(require('./client-upgrade'))
}
