'use strict'

const net = require('net')
const tls = require('tls')
const assert = require('assert')
const util = require('./util')

// TODO: session re-use does not wait for the first
// connection to resolve the session and might therefore
// resolve the same servername multiple times even when
// re-use is enabled.

class Connector {
  constructor ({ tls, socketPath }) {
    this.tls = tls || {} // TODO: Make shallow copy to protect against mutations.
    this.socketPath = socketPath
    this.sessionCache = new Map()
  }

  connect ({ hostname, host, protocol, port, servername }, callback) {
    let socket
    if (protocol === 'https:') {
      servername = servername || this.tls.servername || util.getServerName(host)

      const session = this.tls.reuseSessions !== false
        ? this.sessionCache.get(servername)
        : null

      const opts = { ...this.tls, servername, session }

      /* istanbul ignore next: https://github.com/mcollina/undici/issues/267 */
      socket = this.socketPath
        ? tls.connect(this.socketPath, opts)
        : tls.connect(port || /* istanbul ignore next */ 443, hostname, opts)

      if (this.tls.reuseSessions !== false) {
        const cache = this.sessionCache

        socket
          .on('session', function (session) {
            assert(this.servername)
            cache.set(this.servername, session)
          })
          .on('error', function (err) {
            assert(this.servername)
            if (err.code !== 'UND_ERR_INFO') {
              // TODO (fix): Only delete for session related errors.
              cache.delete(this.servername)
            }
          })
      }
    } else {
      socket = this.socketPath
        ? net.connect(this.socketPath)
        : net.connect(port || /* istanbul ignore next */ 80, hostname)
    }

    socket
      .setNoDelay(true)
      .once(protocol === 'https:' ? 'secureConnect' : 'connect', callback)

    return socket
  }
}

module.exports = (opts) => {
  return Connector.prototype.connect.bind(new Connector(opts))
}
