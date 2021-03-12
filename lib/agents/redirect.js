const { Agent, request } = require('../agent')

const redirectCodes = [300, 301, 302, 303, 307, 308]
const defaultmaxRedirections = 10

const kOriginalRequest = Symbol('originalRequest')

class RedirectAgent extends Agent {
  get (origin) {
    const agent = this
    const pool = super.get(origin)

    // Do not patch twice
    if (pool[kOriginalRequest]) {
      return pool
    }

    // Patch the request method to automatically issue a new request if a 3xx is get and a Location header is present
    pool[kOriginalRequest] = pool.request

    pool.request = function requestWithRedirect (opts, callback) {
      // Parse the redirects related options and normalize then
      if (opts.maxRedirections === false) {
        opts.maxRedirections = -1
      } else if (opts.maxRedirections === true || typeof opts.maxRedirections !== 'number' || isNaN(opts.maxRedirections)) {
        opts.maxRedirections = defaultmaxRedirections
      }

      // Support promise style
      if (callback === undefined) {
        return new Promise((resolve, reject) => {
          pool.request(opts, (err, data) => {
            return err ? reject(err) : resolve(data)
          })
        })
      }

      // Make the request
      pool[kOriginalRequest](opts, (err, data) => {
        if (err) {
          callback(err)
          return
        }

        // Parse status code and headers - Note that the body is ignored even if received
        const { statusCode, headers } = data

        if (
          redirectCodes.indexOf(statusCode) !== -1 &&
          typeof headers.location === 'string' &&
          headers.location.length &&
          opts.maxRedirections >= 0
        ) {
          // In case of HTTP 303, always replace method to be either HEAD or GET
          if (statusCode === 303 && opts.method !== 'HEAD') {
            opts.method = 'GET'
          }

          // Add the current URL to the list of redirects
          if (!opts.redirections) {
            opts.redirections = []
          }

          opts.redirections.push(`${origin}${opts.path}`)

          // Follow the redirect
          request(headers.location, { ...opts, agent, path: null, maxRedirections: opts.maxRedirections - 1 }, callback)
          return
        }

        // When done, include the followed redirects in the returned data
        if (opts.redirections) {
          data.redirections = opts.redirections
        }

        callback(null, data)
      })
    }

    return pool
  }
}

module.exports = RedirectAgent
