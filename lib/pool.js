'use strict'

const Client = require('./client')
const next = Symbol('next')

class Pool {
  constructor (url, opts = {}) {
    let {
      connections,
      pipelining,
      timeout
    } = opts
    connections = connections || 10
    pipelining = pipelining || 1
    this.clients = Array.from({
      length: connections
    }, x => new Client(url, {
      pipelining,
      timeout
    }))

    this[next] = 0
  }

  request (opts, cb) {
    // TODO use a smarter algorithm than round robin
    const current = this[next]++

    if (this[next] === this.clients.length) {
      this[next] = 0
    }

    return this.clients[current].request(opts, cb)
  }

  close () {
    for (const client of this.clients) {
      client.close()
    }
  }

  destroy () {
    for (const client of this.clients) {
      client.destroy()
    }
  }
}

module.exports = Pool
