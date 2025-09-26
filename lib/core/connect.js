'use strict'

const net = require('node:net')
const assert = require('node:assert')
const util = require('./util')
const { InvalidArgumentError } = require('./errors')

/** @type {import('node:tls')} */
let tls // include tls conditionally since it is not always available

const http2Alpn = /** @type {const} */(['http/1.1', 'h2'])
const http1Alpn = /** @type {const} */(['http/1.1'])

// TODO: session re-use does not wait for the first
// connection to resolve the session and might therefore
// resolve the same servername multiple times even when
// re-use is enabled.

const SessionCache = class WeakSessionCache {
  /** @type {number} */
  #maxCachedSessions
  /** @type {Map<string, WeakRef<Buffer<ArrayBufferLike>>>} */
  #sessionCache
  /** @type {FinalizationRegistry} */
  #sessionRegistry
  /** @param {number} maxCachedSessions */
  constructor (maxCachedSessions) {
    if (
      maxCachedSessions != null &&
      (!Number.isInteger(maxCachedSessions) ||
      maxCachedSessions < 0)
    ) {
      throw new InvalidArgumentError('maxCachedSessions must be a positive integer or zero')
    }

    this.#maxCachedSessions = maxCachedSessions
    this.#sessionCache = new Map()
    this.#sessionRegistry = new FinalizationRegistry((key) => {
      if (this.#sessionCache.size < this.#maxCachedSessions) {
        return
      }

      const ref = this.#sessionCache.get(key)
      if (ref !== undefined && ref.deref() === undefined) {
        this.#sessionCache.delete(key)
      }
    })
  }

  /**
   * @param {string} sessionKey
   * @returns {Buffer<ArrayBufferLike>|null}
   */
  get (sessionKey) {
    const ref = this.#sessionCache.get(sessionKey)
    return ref ? ref.deref() : null
  }

  /**
   *
   * @param {string} sessionKey
   * @param {Buffer<ArrayBufferLike>} session
   * @returns
   */
  set (sessionKey, session) {
    if (this.#maxCachedSessions === 0) {
      return
    }

    this.#sessionCache.set(sessionKey, new WeakRef(session))
    this.#sessionRegistry.register(session, sessionKey)
  }
}

/** @typedef {import('node:net').Socket} Socket */

/**
 * @typedef {Object} BuildConnectorOptions
 * @property {boolean} [allowH2=false]
 * @property {number} [maxCachedSessions=100]
 * @property {string} [socketPath]
 * @property {number} [timeout=10000]
 * @property {Buffer} [session]
 * @property {string} [servername]
 * @property {boolean} [keepAlive=true]
 * @property {number} [keepAliveInitialDelay=60000]
 * @property {boolean} [autoSelectFamily]
 * @property {number} [autoSelectFamilyAttemptTimeout]
 */

/**
 * @typedef {Object} ConnectorOptions
 * @property {string} hostname
 * @property {string|null|undefined} [host]
 * @property {'http:'|'https:'|null|undefined} protocol
 * @property {number|string|null|undefined} [port]
 * @property {string|null} [servername]
 * @property {string} localAddress
 * @property {Socket} httpSocket
 */

/** @typedef {((err: Error | null, socket?: Socket) => void)|null} ConnectCallback */
/** @typedef {(options: ConnectorOptions, callback: ConnectCallback) => Socket} Connector */

/**
 * @param {BuildConnectorOptions} param0
 * @returns {Connector}
 */
function buildConnector ({
  allowH2,
  maxCachedSessions = 100,
  session: customSession,
  socketPath: path,
  timeout = 10e3,
  ...opts
}) {
  const options = { path, ...opts }
  const sessionCache = new SessionCache(maxCachedSessions)
  const ALPNProtocols = allowH2 ? http2Alpn : http1Alpn
  const defaultServername = options.servername

  if (options.keepAlive !== false) {
    options.keepAlive = true
    options.keepAliveInitialDelay ||= 60e3
  }

  return function connect ({ hostname, host, protocol, port, servername, localAddress, httpSocket }, callback) {
    let socket
    if (protocol === 'https:') {
      if (!tls) {
        tls = require('node:tls')
      }
      servername = servername || defaultServername || util.getServerName(host) || null

      const sessionKey = servername || hostname
      assert(sessionKey)

      const session = customSession || sessionCache.get(sessionKey) || null

      port = port || 443

      socket = tls.connect({
        highWaterMark: 16384, // TLS in node can't have bigger HWM anyway...
        ...options,
        servername,
        session,
        localAddress,
        ALPNProtocols,
        socket: httpSocket, // upgrade socket connection
        port,
        host: hostname,
        noDelay: true
      })

      socket
        .on('session', function (session) {
          // TODO (fix): Can a session become invalid once established? Don't think so?
          sessionCache.set(sessionKey, session)
        })
    } else {
      assert(!httpSocket, 'httpSocket can only be sent on TLS update')

      port = port || 80

      socket = net.connect({
        highWaterMark: 65536,
        ...options,
        localAddress,
        port,
        host: hostname,
        noDelay: true
      })
    }

    const clearConnectTimeout = util.setupConnectTimeout(new WeakRef(socket), { timeout, hostname, port })

    socket
      .once(protocol === 'https:' ? 'secureConnect' : 'connect', function () {
        queueMicrotask(clearConnectTimeout)

        if (callback) {
          const cb = callback
          callback = null
          cb(null, this)
        }
      })
      .on('error', function (err) {
        queueMicrotask(clearConnectTimeout)

        if (callback) {
          const cb = callback
          callback = null
          cb(err)
        }
      })

    return socket
  }
}

module.exports = buildConnector
