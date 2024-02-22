// @ts-check

'use strict'

const DispatcherBase = require('./dispatcher-base')
const HTTP1Client = require('./client1')

const {
  kBusy,
  kConnect,
  kConnected,
  kNeedDrain,
  kPending,
  kSize,
  kUrl,
  kRunning,
  kSocket
} = require('./core/symbols.js')

// TODO (fix): Move request scheduling here...
class HTTPClient extends DispatcherBase {
  #dispatcher

  constructor (url, opts) {
    super()
    // TODO (fix): Somehow using connect decide whether to use
    // HTTP1Client or HTTP2Client...
    this.#dispatcher = new HTTP1Client(url, opts)

    this.#dispatcher.on('connect', (...args) => this.emit('connect', ...args))
    this.#dispatcher.on('disconnect', (...args) => this.emit('disconnect', ...args))
    this.#dispatcher.on('connectionError', (...args) => this.emit('connectionError', ...args))
    this.#dispatcher.on('error', (...args) => this.emit('error', ...args))
    this.#dispatcher.on('drain', (...args) => this.emit('drain', ...args))
  }

  dispatch (...args) {
    return this.#dispatcher.dispatch(...args)
  }

  close (...args) {
    return this.#dispatcher.close(...args)
  }

  destroy (...args) {
    return this.#dispatcher.destroy(...args)
  }

  // TODO (fix): Avoid the coupling from the members below.

  [kConnect] (...args) {
    return this.#dispatcher[kConnect](...args)
  }

  get [kSocket] () {
    return this.#dispatcher[kSocket]
  }

  get [kBusy] () {
    return this.#dispatcher[kBusy]
  }

  get [kNeedDrain] () {
    return this.#dispatcher[kNeedDrain]
  }

  get [kConnected] () {
    return this.#dispatcher[kConnected]
  }

  get [kPending] () {
    return this.#dispatcher[kPending]
  }

  get [kUrl] () {
    return this.#dispatcher[kUrl]
  }

  get [kRunning] () {
    return this.#dispatcher[kRunning]
  }

  get [kSize] () {
    return this.#dispatcher[kSize]
  }

  get pipelining () {
    return this.#dispatcher.pipelining
  }

  set pipelining (value) {
    this.#dispatcher.pipelining = value
  }
}

module.exports = HTTPClient
