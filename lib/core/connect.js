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

    if (this.tls.maxCachedSessions === undefined) {
      this.tls.maxCachedSessions = 100
    }

    this.socketPath = socketPath
    this.sessionCache = { map: new Map(), list: [] }
  }

  connect ({ hostname, host, protocol, port, servername }, callback) {
    let socket
    if (protocol === 'https:') {
      servername = servername || this.tls.servername || util.getServerName(host)

      const session = this.tls.reuseSessions !== false
        ? this.sessionCache.map.get(servername)
        : null

      const opts = { ...this.tls, servername, session }

      socket = this.socketPath
        ? tls.connect(this.socketPath, opts)
        : tls.connect(port || /* istanbul ignore next */ 443, hostname, opts)

      if (this.tls.reuseSessions !== false) {
        const cache = this.sessionCache

        socket
          .on('session', function (session) {
            assert(this.servername)

            // cache is disabled
            if (opts.maxCachedSessions === 0) {
              return
            }

            if (cache.list.length >= opts.maxCachedSessions) {
              const oldKey = cache.list.shift()
              cache.map.delete(oldKey)
            }

            cache.list.push(this.servername)
            cache.map.set(this.servername, session)
          })
          .on('error', function (err) {
            assert(this.servername)
            if (err.code !== 'UND_ERR_INFO') {
              // TODO (fix): Only delete for session related errors.
              const sessionIndex = cache.list.indexOf(this.servername)

              if (sessionIndex > -1) {
                cache.list.splice(sessionIndex, 1)
                cache.map.delete(this.servername)
              }
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
