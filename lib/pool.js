'use strict'

const Client = require('./client')
const current = Symbol('current')

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

    for (const client of this.clients) {
      client.on('drain', onDrain)
    }

    this.drained = []
    this[current] = null

    const that = this
    function onDrain () {
      // this is the client
      that.drained.push(this)
    }
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

    if (this[current] === null) {
      if (this.drained.length > 0) {
        // LIFO QUEUE
        // we use the last one that drained, because that's the one
        // that is more probable to have an alive socket
        this[current] = this.drained.pop()
      } else {
        // if no one drained recently, let's just pick one randomly
        this[current] = this.clients[Math.floor(Math.random() * this.clients.length)]
      }
    }

    const writeMore = this[current].request(opts, cb)

    if (!writeMore) {
      this[current] = null
    }
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
