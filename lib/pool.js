'use strict'

const Client = require('./client')

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

    let next
    for (const client of this.clients) {
      if (client.full) {
        continue
      }

      next = client

      if (client.connected) {
        break
      }
    }

    if (!next) {
      next = this.clients[Math.floor(Math.random() * this.clients.length)]
    }

    next.request(opts, cb)
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
