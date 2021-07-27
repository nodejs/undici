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

function buildConnector ({ maxCachedSessions, socketPath, timeout, ...opts }) {
  if (maxCachedSessions != null && (!Number.isInteger(maxCachedSessions) || maxCachedSessions < 0)) {
    throw new InvalidArgumentError('maxCachedSessions must be a positive integer or zero')
  }

  const options = { path: socketPath, ...opts }
  const sessionCache = new Map()
  timeout = timeout == null ? 10e3 : timeout
  maxCachedSessions = maxCachedSessions == null ? 100 : maxCachedSessions

  return function connect ({ hostname, host, protocol, port, servername }, callback) {
    let socket
    if (protocol === 'https:') {
      servername = servername || options.servername || util.getServerName(host)

      const session = sessionCache.get(servername) || null

      socket = tls.connect({
        ...options,
        servername,
        session,
        port: port || 443,
        host: hostname
      })

      socket
        .on('session', function (session) {
          assert(this.servername)

          // cache is disabled
          if (maxCachedSessions === 0) {
            return
          }

          if (sessionCache.size >= maxCachedSessions) {
            // remove the oldest session
            const { value: oldestKey } = sessionCache.keys().next()
            sessionCache.delete(oldestKey)
          }

          sessionCache.set(this.servername, session)
        })
        .on('error', function (err) {
          if (this.servername && err.code !== 'UND_ERR_INFO') {
            // TODO (fix): Only delete for session related errors.
            sessionCache.delete(this.servername)
          }
        })
    } else {
      socket = net.connect({
        ...options,
        port: port || 80,
        host: hostname
      })
    }

    const timeoutId = timeout
      ? setTimeout(onConnectTimeout, timeout, socket)
      : null

    socket
      .setNoDelay(true)
      .once(protocol === 'https:' ? 'secureConnect' : 'connect', function () {
        clearTimeout(timeoutId)

        if (callback) {
          const cb = callback
          callback = null
          cb(null, this)
        }
      })
      .on('error', function (err) {
        clearTimeout(timeoutId)

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

module.exports = buildConnector
