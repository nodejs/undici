'use strict'

const { AsyncResource } = require('async_hooks')

class Request extends AsyncResource {
  constructor (opts) {
    super('UNDICI_REQ')

    this.method = opts.method
    this.path = opts.path
    this.body = opts.body
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
}

module.exports = Request
