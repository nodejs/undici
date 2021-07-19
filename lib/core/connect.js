'use strict'

const net = require('net')
const tls = require('tls')
const assert = require('assert')
const util = require('./util')
const { InvalidArgumentError, ConnectTimeoutError } = require('./errors')

// TODO: session re-use does not wait for the first
// connection to resolve the session and might therefore
// resolve the same servername multiple times even when
// re-use is enabled.

class Connector {
  constructor ({ maxCachedSessions, socketPath, timeout, ...opts }) {
    if (maxCachedSessions != null && (!Number.isInteger(maxCachedSessions) || maxCachedSessions < 0)) {
      throw new InvalidArgumentError('maxCachedSessions must be a positive integer or zero')
    }

    this.opts = { path: socketPath, ...opts }
    this.timeout = timeout == null ? 10e3 : timeout
    this.sessionCache = new Map()
    this.maxCachedSessions = maxCachedSessions == null ? 100 : maxCachedSessions
  }

  connect ({ hostname, host, protocol, port, servername }, callback) {
    let socket
    if (protocol === 'https:') {
      servername = servername || this.opts.servername || util.getServerName(host)

      const session = this.sessionCache.get(servername) || null

      socket = tls.connect({
        ...this.opts,
        servername,
        session,
        port: port || 443,
        host: hostname
      })

      const cache = this.sessionCache
      const maxCachedSessions = this.maxCachedSessions

      socket
        .on('session', function (session) {
          assert(this.servername)

          // cache is disabled
          if (maxCachedSessions === 0) {
            return
          }

          if (cache.size >= maxCachedSessions) {
            // remove the oldest session
            const { value: oldestKey } = cache.keys().next()
            cache.delete(oldestKey)
          }

          cache.set(this.servername, session)
        })
        .on('error', function (err) {
          if (this.servername && err.code !== 'UND_ERR_INFO') {
            // TODO (fix): Only delete for session related errors.
            cache.delete(this.servername)
          }
        })
    } else {
      socket = net.connect({
        ...this.opts,
        port: port || 80,
        host: hostname
      })
    }

    const timeout = this.timeout
      ? setTimeout(onConnectTimeout, this.timeout, socket)
      : null

    socket
      .setNoDelay(true)
      .once(protocol === 'https:' ? 'secureConnect' : 'connect', function () {
        if (callback) {
          clearTimeout(timeout)

          const cb = callback
          callback = null
          cb(null, this)
        }
      })
      .on('error', function (err) {
        if (callback) {
          const cb = callback
          callback = null
          cb(err)
        }
      })

    return socket
  }
}

function onConnectTimeout (socket) {
  util.destroy(socket, new ConnectTimeoutError())
}

module.exports = (opts) => {
  return Connector.prototype.connect.bind(new Connector(opts))
}
