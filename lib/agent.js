'use strict'

const {
  ClientClosedError,
  InvalidArgumentError,
  ClientDestroyedError
} = require('./core/errors')
const Dispatcher = require('./dispatcher')
const Pool = require('./pool')
const Client = require('./client')
const util = require('./core/util')
const assert = require('assert')
const RedirectHandler = require('./handler/redirect')

const kDestroyed = Symbol('destroyed')
const kClosed = Symbol('closed')
const kOnConnect = Symbol('onConnect')
const kOnDisconnect = Symbol('onDisconnect')
const kClients = Symbol('clients')
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

const WeakRef = global.WeakRef || class DummyWeakRef {
  constructor (value) {
    this.value = value
  }

  deref () {
    return this.value
  }
}
const FinalizationRegistry = global.FinalizationRegistry || class DummyFinalizer {
  register () {}
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
    this[kFinalizer] = new FinalizationRegistry(key => {
      const ref = this[kClients].get(key)
      if (ref !== undefined && ref.deref() === undefined) {
        this[kClients].delete(key)
      }
    })
    this[kClosed] = false
    this[kDestroyed] = false

    const agent = this

    this[kOnDrain] = function onDrain (origin, targets) {
      agent.emit('drain', origin, [agent, ...targets])
    }

    this[kOnConnect] = function onConnect (origin, targets) {
      agent.emit('connect', origin, [agent, ...targets])
    }

    this[kOnDisconnect] = function onDisconnect (origin, targets, err) {
      agent.emit('disconnect', origin, [agent, ...targets], err)
    }
  }

  get connected () {
    let ret = 0
    for (const { connected } of this[kClients].values()) {
      ret += connected
    }
    return ret
  }

  get size () {
    let ret = 0
    for (const { size } of this[kClients].values()) {
      ret += size
    }
    return ret
  }

  get pending () {
    let ret = 0
    for (const { pending } of this[kClients].values()) {
      ret += pending
    }
    return ret
  }

  get running () {
    let ret = 0
    for (const { running } of this[kClients].values()) {
      ret += running
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

      let client = ref ? ref.deref() : null
      if (!client) {
        client = this[kFactory](opts.origin, this[kOptions])
          .on('connect', this[kOnConnect])
          .on('disconnect', this[kOnDisconnect])
          .on('drain', this[kOnDrain])

        this[kClients].set(opts.origin, new WeakRef(client))
        this[kFinalizer].register(client, opts.origin)
      }

      const { maxRedirections = this[kMaxRedirections] } = opts

      if (!Number.isInteger(maxRedirections) || maxRedirections < 0) {
        throw new InvalidArgumentError('maxRedirections must be a positive number')
      }

      if (!maxRedirections) {
        return client.dispatch(opts, handler)
      }

      if (util.isStream(opts.body) && util.bodyLength(opts.body) !== 0) {
        // TODO (fix): Provide some way for the user to cache the file to e.g. /tmp
        // so that it can be dispatched again?
        // TODO (fix): Do we need 100-expect support to provide a way to do this properly?
        return client.dispatch(opts, handler)
      }

      /* istanbul ignore next */
      if (util.isStream(opts.body)) {
        opts.body
          .on('data', function () {
            assert(false)
          })
      }

      return client.dispatch(opts, new RedirectHandler(this, opts, handler))
    } catch (err) {
      if (typeof handler.onError !== 'function') {
        throw new InvalidArgumentError('invalid onError method')
      }

      handler.onError(err)
    }
  }

  close () {
    this[kClosed] = true

    const closePromises = []
    for (const ref of this[kClients].values()) {
      const client = ref.deref()
      if (client) {
        closePromises.push(client.close())
      }
    }
    return Promise.all(closePromises)
  }

  destroy () {
    this[kClosed] = true
    this[kDestroyed] = true

    const destroyPromises = []
    for (const ref of this[kClients].values()) {
      const client = ref.deref()
      if (client) {
        destroyPromises.push(client.destroy())
      }
    }
    return Promise.all(destroyPromises)
  }
}

module.exports = Agent
