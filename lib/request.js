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
  constructor (opts) {
    super('UNDICI_REQ')

    if (!opts) {
      throw new Error('no options passed')
    }

    if (!(typeof opts.path === 'string' && opts.path[0] === '/')) {
      throw new Error('path must be a valid path')
    }
    this.method = opts.method

    if (!(typeof opts.method === 'string' && methods[opts.method])) {
      throw new Error('method must be a valid method')
    }
    this.path = opts.path

    // TODO we should validate that the http method accepts a body or not
    if (!isValidBody(opts.body)) {
      throw new Error('body must be a string, a Buffer or a Readable stream')
    }
    this.body = opts.body

    // should we validate the headers?
    this.headers = opts.headers
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
