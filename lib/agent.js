'use strict'

const {
  ClientClosedError,
  InvalidArgumentError,
  ClientDestroyedError
} = require('./core/errors')
const { kClients, kPending, kRunning, kSize, kConnected } = require('./core/symbols')
const Dispatcher = require('./dispatcher')
const Pool = require('./pool')
const Client = require('./client')
const util = require('./core/util')
const assert = require('assert')
const RedirectHandler = require('./handler/redirect')
const { WeakRef, FinalizationRegistry } = require('./compat/dispatcher-weakref')()

const kDestroyed = Symbol('destroyed')
const kClosed = Symbol('closed')
const kOnConnect = Symbol('onConnect')
const kOnDisconnect = Symbol('onDisconnect')
const kMaxRedirections = Symbol('maxRedirections')
const kOnDrain = Symbol('onDrain')
const kFactory = Symbol('factory')
const kFinalizer = Symbol('finalizer')
const kOptions = Symbol('options')

function defaultFactory (origin, opts) {
  return opts && opts.connections === 1
    ? new Client(origin, opts)
    : new Pool(origin, opts)
}

class Agent extends Dispatcher {
  constructor ({ factory = defaultFactory, maxRedirections = 0, ...options } = {}) {
    super()

    if (typeof factory !== 'function') {
      throw new InvalidArgumentError('factory must be a function.')
    }

    if (!Number.isInteger(maxRedirections) || maxRedirections < 0) {
      throw new InvalidArgumentError('maxRedirections must be a positive number')
    }

    this[kOptions] = JSON.parse(JSON.stringify(options))
    this[kMaxRedirections] = maxRedirections
    this[kFactory] = factory
    this[kClients] = new Map()
    this[kFinalizer] = new FinalizationRegistry(key => /* istanbul ignore next: gc is undeterministic */{
      const ref = this[kClients].get(key)
      if (ref !== undefined && ref.deref() === undefined) {
        this[kClients].delete(key)
      }
    })
    this[kClosed] = false
    this[kDestroyed] = false

    const agent = this

    this[kOnDrain] = (origin, targets) => {
      agent.emit('drain', origin, [agent, ...targets])
    }

    this[kOnConnect] = (origin, targets) => {
      agent.emit('connect', origin, [agent, ...targets])
    }

    this[kOnDisconnect] = (origin, targets, err) => {
      agent.emit('disconnect', origin, [agent, ...targets], err)
    }
  }

  /* istanbul ignore next: only used for test */
  get [kConnected] () {
    let ret = 0
    for (const ref of this[kClients].values()) {
      const client = ref.deref()
      if (client) {
        ret += client[kConnected]
      }
    }
    return ret
  }

  /* istanbul ignore next: only used for test */
  get [kPending] () {
    let ret = 0
    for (const ref of this[kClients].values()) {
      const client = ref.deref()
      if (client) {
        ret += client[kPending]
      }
    }
    return ret
  }

  /* istanbul ignore next: only used for test */
  get [kRunning] () {
    let ret = 0
    for (const ref of this[kClients].values()) {
      const client = ref.deref()
      if (client) {
        ret += client[kRunning]
      }
    }
    return ret
  }

  /* istanbul ignore next: only used for test */
  get [kSize] () {
    let ret = 0
    for (const ref of this[kClients].values()) {
      const client = ref.deref()
      if (client) {
        ret += client[kSize]
      }
    }
    return ret
  }

  dispatch (opts, handler) {
    if (!handler || typeof handler !== 'object') {
      throw new InvalidArgumentError('handler')
    }

    try {
      if (!opts || typeof opts !== 'object') {
        throw new InvalidArgumentError('opts must be a object.')
      }

      if (typeof opts.origin !== 'string' || opts.origin === '') {
        throw new InvalidArgumentError('opts.origin must be a non-empty string.')
      }

      if (this[kDestroyed]) {
        throw new ClientDestroyedError()
      }

      if (this[kClosed]) {
        throw new ClientClosedError()
      }

      const ref = this[kClients].get(opts.origin)

      let dispatcher = ref ? ref.deref() : null
      if (!dispatcher) {
        dispatcher = this[kFactory](opts.origin, this[kOptions])
          .on('connect', this[kOnConnect])
          .on('disconnect', this[kOnDisconnect])
          .on('drain', this[kOnDrain])

        this[kClients].set(opts.origin, new WeakRef(dispatcher))
        this[kFinalizer].register(dispatcher, opts.origin)
      }

      const { maxRedirections = this[kMaxRedirections] } = opts

      if (!Number.isInteger(maxRedirections) || maxRedirections < 0) {
        throw new InvalidArgumentError('maxRedirections must be a positive number')
      }

      if (!maxRedirections) {
        return dispatcher.dispatch(opts, handler)
      }

      if (util.isStream(opts.body) && util.bodyLength(opts.body) !== 0) {
        // TODO (fix): Provide some way for the user to cache the file to e.g. /tmp
        // so that it can be dispatched again?
        // TODO (fix): Do we need 100-expect support to provide a way to do this properly?
        return dispatcher.dispatch(opts, handler)
      }

      /* istanbul ignore next */
      if (util.isStream(opts.body)) {
        opts.body
          .on('data', function () {
            assert(false)
          })
      }

      return dispatcher.dispatch(opts, new RedirectHandler(this, opts, handler))
    } catch (err) {
      if (typeof handler.onError !== 'function') {
        throw new InvalidArgumentError('invalid onError method')
      }

      handler.onError(err)
    }
  }

  get closed () {
    return this[kClosed]
  }

  get destroyed () {
    return this[kDestroyed]
  }

  close (callback) {
    if (callback != null && typeof callback !== 'function') {
      throw new InvalidArgumentError('callback must be a function')
    }

    this[kClosed] = true

    const closePromises = []
    for (const ref of this[kClients].values()) {
      const client = ref.deref()
      /* istanbul ignore else: gc is undeterministic */
      if (client) {
        closePromises.push(client.close())
      }
    }

    if (!callback) {
      return Promise.all(closePromises)
    }

    // Should never error.
    Promise.all(closePromises).then(() => process.nextTick(callback))
  }

  destroy (err, callback) {
    if (typeof err === 'function') {
      callback = err
      err = null
    }

    if (callback != null && typeof callback !== 'function') {
      throw new InvalidArgumentError('callback must be a function')
    }

    this[kClosed] = true
    this[kDestroyed] = true

    const destroyPromises = []
    for (const ref of this[kClients].values()) {
      const client = ref.deref()
      /* istanbul ignore else: gc is undeterministic */
      if (client) {
        destroyPromises.push(client.destroy(err))
      }
    }

    if (!callback) {
      return Promise.all(destroyPromises)
    }

    // Should never error.
    Promise.all(destroyPromises).then(() => process.nextTick(callback))
  }
}

module.exports = Agent
