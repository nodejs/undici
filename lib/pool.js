'use strict'

const Client = require('./client')
const kIndex = Symbol('index')
const kDrained = Symbol('drained')

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

    this[kIndex] = 0
    this[kDrained] = []

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
  while (pool[kDrained].length > 0) {
    // LIFO QUEUE
    // We use the last one that drained, because that's the one
    // that is more probable to have an alive socket.
    const client = pool[kDrained].pop()
    if (client.connected) {
      return client
    }
  }

  // If no one drained recently, round robin connected clients.
  const len = clients.length
  let idx = pool[kIndex]
  for (let n = 0; n < len; ++n) {
    const client = pool.clients[idx]
    idx = (idx + 1) % len
    if (client.connected) {
      pool[kIndex] = idx
      return client
    }
  }

  pool[kIndex] = Math.floor(Math.random() * len)
  return pool.clients[pool[kIndex]]
}

module.exports = Pool
