'use strict'
const { connect } = require('node:net')

const { kClose, kDestroy } = require('../core/symbols')

const Client = require('./Client')
const DispatcherBase = require('./dispatcher-base')

class H2CClient extends DispatcherBase {
  #client = null

  constructor (origin, opts) {
    super()
    this.#client = new Client(origin, {
      ...opts,
      connect: this.#buildConnector(),
      allowH2: true
    })
  }

  #buildConnector () {
    return async (opts, callback) => {
      const socket = connect({
        ...opts,
        host: opts.hostname,
        port: opts.port,
        path: opts.pathname,
        signal: opts.signal
      })

      // Set TCP keep alive options on the socket here instead of in connect() for the case of assigning the socket
      if (opts.keepAlive == null || opts.keepAlive) {
        const keepAliveInitialDelay =
          opts.keepAliveInitialDelay == null ? 60e3 : opts.keepAliveInitialDelay
        socket.setKeepAlive(true, keepAliveInitialDelay)
      }

      // TODO: Implement buildConnector intrinsics
      socket.alpnProtocol = 'h2'

      callback(null, socket)
    }
  }

  dispatch (opts, handler) {
    return this.#client.dispatch(opts, handler)
  }

  async [kClose] () {
    await this.#client.close()
  }

  async [kDestroy] () {
    await this.#client.destroy()
  }
}

module.exports = H2CClient
