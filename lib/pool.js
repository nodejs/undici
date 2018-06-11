'use strict'

const Client = require('./client')
const next = Symbol('next')

class Pool {
  constructor (url, opts = {}) {
    let { connections, pipelining } = opts
    connections = connections || 10
    pipelining = pipelining || 10
    this.clients = Array.from({
      length: connections
    }, x => new Client(url, { pipelining }))

    this[next] = 0

    // TODO setup error handling
    // TODO reconnect if one dies
    // maybe lazy load?
  }

  request (opts, cb) {
    // TODO Validate opts and cb?
    const current = this[next]++

    this.clients[current].request(opts, cb)

    if (this[next] === this.clients.length) {
      this[next] = 0
    }
  }

  close () {
    for (const client of this.clients) {
      client.close()
    }
  }
}

module.exports = Pool
