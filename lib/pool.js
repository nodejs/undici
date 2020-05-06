'use strict'

const Client = require('./client')
const kIndex = Symbol('index')

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

    this[kIndex] = 0
  }

  request (opts, cb) {
    // needed because we need the return value from client.request
    if (cb === undefined) {
      return new Promise((resolve, reject) => {
        this.request(opts, (err, data) => {
          return err ? reject(err) : resolve(data)
        })
      })
    }

    next(this).request(opts, cb)
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

function next (pool) {
  // Round robin connected clients.
  const len = pool.clients.length
  for (let n = 0; n < len; ++n) {
    const client = pool.clients[pool[kIndex]]
    pool[kIndex] = (pool[kIndex] + 1) % len
    if (client.connected && !client.full) {
      return client
    }
  }

  return pool.clients[pool[kIndex]++]
}

module.exports = Pool
