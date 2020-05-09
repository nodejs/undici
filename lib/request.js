'use strict'

const { AsyncResource } = require('async_hooks')

const methods = [
  'ACL',
  'BIND',
  'CHECKOUT',
  'CONNECT',
  'COPY',
  'DELETE',
  'GET',
  'HEAD',
  'LINK',
  'LOCK',
  'M-SEARCH',
  'MERGE',
  'MKACTIVITY',
  'MKCALENDAR',
  'MKCOL',
  'MOVE',
  'NOTIFY',
  'OPTIONS',
  'PATCH',
  'POST',
  'PROPFIND',
  'PROPPATCH',
  'PURGE',
  'PUT',
  'REBIND',
  'REPORT',
  'SEARCH',
  'SOURCE',
  'SUBSCRIBE',
  'TRACE',
  'UNBIND',
  'UNLINK',
  'UNLOCK',
  'UNSUBSCRIBE'
].reduce((acc, m) => {
  acc[m] = true
  return acc
}, {})

function isValidBody (body) {
  if (!body) {
    return true
  }

  return body instanceof Buffer ||
    typeof body === 'string' ||
    typeof body.pipe === 'function'
}

class Request extends AsyncResource {
  constructor (opts, callback) {
    super('UNDICI_REQ')

    if (!opts) {
      throw new Error('no options passed')
    }

    const { path, method, body, headers } = opts

    if (!(typeof path === 'string' && path[0] === '/')) {
      throw new Error('path must be a valid path')
    }

    if (!(typeof method === 'string' && methods[method])) {
      throw new Error('method must be a valid method')
    }

    if (!isValidBody(body)) {
      throw new Error('body must be a string, a Buffer or a Readable stream')
    }

    this.method = method

    this.path = path

    this.body = body

    this.host = headers && (headers.host || headers.Host)

    this.chunked = !headers || headers['content-length'] === undefined

    this.callback = this.wrap(callback)

    this.rawHeaders = ''

    if (headers) {
      const headerNames = Object.keys(headers)
      for (let i = 0; i < headerNames.length; i++) {
        const name = headerNames[i]
        this.rawHeaders += name + ': ' + headers[name] + '\r\n'
      }
    }
  }

  wrap (cb) {
    // happy path for Node 10+
    if (this.runInAsyncScope) {
      return this.runInAsyncScope.bind(this, cb, undefined)
    }

    // old API for Node 8
    return (err, val) => {
      this.emitBefore()
      cb(err, val)
      this.emitAfter()
    }
  }

  wrapSimple (that, cb) {
    // happy path for Node 10+
    if (this.runInAsyncScope) {
      return this.runInAsyncScope.bind(this, cb, that)
    }

    // old API for Node 8
    return (a) => {
      this.emitBefore()
      cb.call(that, a)
      this.emitAfter()
    }
  }
}

module.exports = Request
