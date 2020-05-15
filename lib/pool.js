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

  stream (opts, factory, cb) {
    // needed because we need the return value from client.request
    if (cb === undefined) {
      return new Promise((resolve, reject) => {
        this.request(opts, (err, data) => {
          return err ? reject(err) : resolve(data)
        })
      })
    }

    getNext(this).stream(opts, factory, cb)
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

    getNext(this).request(opts, cb)
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

function getNext (pool) {
  let next
  for (const client of pool.clients) {
    if (client.full) {
      continue
    }

    if (!next) {
      next = client
    }

    if (client.connected) {
      return client
    }
  }

  return next || pool.clients[Math.floor(Math.random() * pool.clients.length)]
}

module.exports = Pool
