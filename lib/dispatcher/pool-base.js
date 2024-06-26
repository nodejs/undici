'use strict'

const DispatcherBase = require('./dispatcher-base')
const FixedQueue = require('./fixed-queue')
const { kConnected, kSize, kRunning, kPending, kQueued, kBusy, kFree, kUrl, kClose, kDestroy, kDispatch } = require('../core/symbols')
const PoolStats = require('./pool-stats')

const kClients = Symbol('clients')
const kNeedDrain = Symbol('needDrain')
const kQueue = Symbol('queue')
const kClosedResolve = Symbol('closed resolve')
const kOnDrain = Symbol('onDrain')
const kOnConnect = Symbol('onConnect')
const kOnDisconnect = Symbol('onDisconnect')
const kOnConnectionError = Symbol('onConnectionError')
const kGetDispatcher = Symbol('get dispatcher')
const kAddClient = Symbol('add client')
const kRemoveClient = Symbol('remove client')
const kStats = Symbol('stats')
const kDrainQueue = Symbol('kDrainQueue')

class PoolBase extends DispatcherBase {
  constructor () {
    super()

    this[kQueue] = new FixedQueue()
    this[kClients] = []
    this[kQueued] = 0
    this[kNeedDrain] = false

    const pool = this

    this[kOnDrain] = function onDrain (err, dispatcher, ...args) {
      const queue = pool[kQueue]

      if (queue.isEmpty()) {
        return
      }

      const { opts, handler } = queue.shift()
      pool[kQueued]--

      if (!dispatcher.dispatch(opts, handler, this[kOnDrain])) {
        // XXX: unshift
        queue.push({ opts, handler })
        pool[kQueued]++
      }

      if (!queue.isEmpty()) {
        return
      }

      // XXX: notify one
      for (const callback of pool[kDrainQueue].splice(0)) {
        callback(err)
      }

      if (!queue.isEmpty()) {
        return
      }

      if (pool[kNeedDrain]) {
        pool[kNeedDrain] = false
        pool.emit('drain', ...args)
      }

      if (pool[kClosedResolve]) {
        Promise
          .all(pool[kClients].map(c => c.close()))
          .then(pool[kClosedResolve])
      }
    }

    this[kOnConnect] = (origin, targets) => {
      pool.emit('connect', origin, [pool, ...targets])
    }

    this[kOnDisconnect] = (origin, targets, err) => {
      pool.emit('disconnect', origin, [pool, ...targets], err)
    }

    this[kOnConnectionError] = (origin, targets, err) => {
      pool.emit('connectionError', origin, [pool, ...targets], err)
    }

    this[kStats] = new PoolStats(this)
    this[kDrainQueue] = []
  }

  get [kBusy] () {
    return this[kQueued] > 0
  }

  get [kConnected] () {
    return this[kClients].filter(client => client[kConnected]).length
  }

  get [kFree] () {
    return this[kClients].filter(client => client[kConnected] && !client[kNeedDrain]).length
  }

  get [kPending] () {
    let ret = this[kQueued]
    for (const { [kPending]: pending } of this[kClients]) {
      ret += pending
    }
    return ret
  }

  get [kRunning] () {
    let ret = 0
    for (const { [kRunning]: running } of this[kClients]) {
      ret += running
    }
    return ret
  }

  get [kSize] () {
    let ret = this[kQueued]
    for (const { [kSize]: size } of this[kClients]) {
      ret += size
    }
    return ret
  }

  get stats () {
    return this[kStats]
  }

  async [kClose] () {
    if (this[kQueue].isEmpty()) {
      return Promise.all(this[kClients].map(c => c.close()))
    } else {
      return new Promise((resolve) => {
        this[kClosedResolve] = resolve
      })
    }
  }

  async [kDestroy] (err) {
    for (const callback of this[kDrainQueue].splice(0)) {
      callback(err)
    }

    while (true) {
      const item = this[kQueue].shift()
      if (!item) {
        break
      }
      item.handler.onError(err)
    }

    return Promise.all(this[kClients].map(c => c.destroy(err)))
  }

  [kDispatch] (opts, handler, onDrain) {
    for (const dispatcher of this[kGetDispatcher]()) {
      if (dispatcher.dispatch(opts, handler, this[kOnDrain])) {
        return true
      }
    }

    if (onDrain) {
      this[kDrainQueue].push(onDrain)
    } else {
      this[kQueue].push({ opts, handler })
      this[kQueued]++
      this[kNeedDrain] = true
    }

    return false
  }

  [kAddClient] (client) {
    client
      .on('drain', this[kOnDrain])
      .on('connect', this[kOnConnect])
      .on('disconnect', this[kOnDisconnect])
      .on('connectionError', this[kOnConnectionError])

    this[kClients].push(client)

    return this
  }

  [kRemoveClient] (client) {
    client.close(() => {
      const idx = this[kClients].indexOf(client)
      if (idx !== -1) {
        this[kClients].splice(idx, 1)
      }
    })

    this[kNeedDrain] = this[kClients].some(dispatcher => (
      !dispatcher[kNeedDrain] &&
      dispatcher.closed !== true &&
      dispatcher.destroyed !== true
    ))
  }
}

module.exports = {
  PoolBase,
  kClients,
  kNeedDrain,
  kAddClient,
  kRemoveClient,
  kGetDispatcher
}
