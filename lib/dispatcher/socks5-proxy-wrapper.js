'use strict'

const net = require('node:net')
const tls = require('node:tls')
const { URL } = require('node:url')
const DispatcherBase = require('./dispatcher-base')
const { InvalidArgumentError } = require('../core/errors')
const { Socks5Client } = require('../core/socks5-client')
const { kDispatch, kClose, kDestroy } = require('../core/symbols')
const Client = require('./client')
const buildConnector = require('../core/connect')
const { debuglog } = require('node:util')

const debug = debuglog('undici:socks5-proxy')

const kProxyUrl = Symbol('proxy url')
const kProxyHeaders = Symbol('proxy headers')
const kProxyAuth = Symbol('proxy auth')
const kClient = Symbol('client')
const kConnector = Symbol('connector')

/**
 * SOCKS5 proxy wrapper for dispatching requests through a SOCKS5 proxy
 */
class Socks5ProxyWrapper extends DispatcherBase {
  constructor (proxyUrl, options = {}) {
    super()

    if (!proxyUrl) {
      throw new InvalidArgumentError('Proxy URL is mandatory')
    }

    // Parse proxy URL
    const url = typeof proxyUrl === 'string' ? new URL(proxyUrl) : proxyUrl

    if (url.protocol !== 'socks5:' && url.protocol !== 'socks:') {
      throw new InvalidArgumentError('Proxy URL must use socks5:// or socks:// protocol')
    }

    this[kProxyUrl] = url
    this[kProxyHeaders] = options.headers || {}

    // Extract auth from URL or options
    this[kProxyAuth] = {
      username: options.username || (url.username ? decodeURIComponent(url.username) : null),
      password: options.password || (url.password ? decodeURIComponent(url.password) : null)
    }

    // Create connector for proxy connection
    this[kConnector] = options.connect || buildConnector({
      ...options.proxyTls,
      servername: options.proxyTls?.servername || url.hostname
    })

    // Client for the actual HTTP connection (created after SOCKS5 tunnel is established)
    this[kClient] = null
  }

  /**
   * Create a SOCKS5 connection to the proxy
   */
  async createSocks5Connection (targetHost, targetPort) {
    const proxyHost = this[kProxyUrl].hostname
    const proxyPort = parseInt(this[kProxyUrl].port) || 1080

    debug('creating SOCKS5 connection to', proxyHost, proxyPort)

    // Connect to the SOCKS5 proxy
    const socket = await new Promise((resolve, reject) => {
      const onConnect = () => {
        socket.removeListener('error', onError)
        resolve(socket)
      }

      const onError = (err) => {
        socket.removeListener('connect', onConnect)
        reject(err)
      }

      const socket = net.connect({
        host: proxyHost,
        port: proxyPort
      })

      socket.once('connect', onConnect)
      socket.once('error', onError)
    })

    // Create SOCKS5 client
    const socks5Client = new Socks5Client(socket, this[kProxyAuth])

    // Handle SOCKS5 errors
    socks5Client.on('error', (err) => {
      debug('SOCKS5 error:', err)
      socket.destroy()
    })

    // Perform SOCKS5 handshake
    await socks5Client.handshake()

    // Wait for authentication
    await new Promise((resolve, reject) => {
      const onAuthenticated = () => {
        socks5Client.removeListener('error', onError)
        resolve()
      }

      const onError = (err) => {
        socks5Client.removeListener('authenticated', onAuthenticated)
        reject(err)
      }

      if (socks5Client.state === 'authenticated' || socks5Client.state === 'handshaking') {
        resolve()
      } else {
        socks5Client.once('authenticated', onAuthenticated)
        socks5Client.once('error', onError)
      }
    })

    // Send CONNECT command
    await socks5Client.connect(targetHost, targetPort)

    // Wait for connection
    await new Promise((resolve, reject) => {
      const onConnected = (info) => {
        debug('SOCKS5 tunnel established to', targetHost, targetPort, 'via', info)
        socks5Client.removeListener('error', onError)
        resolve()
      }

      const onError = (err) => {
        socks5Client.removeListener('connected', onConnected)
        reject(err)
      }

      socks5Client.once('connected', onConnected)
      socks5Client.once('error', onError)
    })

    return socket
  }

  /**
   * Dispatch a request through the SOCKS5 proxy
   */
  async [kDispatch] (opts, handler) {
    const { origin } = opts
    const url = new URL(origin)
    const targetHost = url.hostname
    const targetPort = parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80)

    debug('dispatching request to', targetHost, targetPort, 'via SOCKS5')

    try {
      // Create SOCKS5 tunnel if we don't have a client yet
      if (!this[kClient] || this[kClient].destroyed || this[kClient].closed) {
        const socket = await this.createSocks5Connection(targetHost, targetPort)

        // Handle TLS if needed
        let finalSocket = socket
        if (url.protocol === 'https:') {
          debug('upgrading to TLS')
          finalSocket = tls.connect({
            socket,
            servername: targetHost,
            ...opts.tls
          })

          await new Promise((resolve, reject) => {
            finalSocket.once('secureConnect', resolve)
            finalSocket.once('error', reject)
          })
        }

        // Create HTTP client using the tunneled socket
        this[kClient] = new Client(origin, {
          socket: finalSocket,
          pipelining: opts.pipelining
        })
      }

      // Dispatch the request through the client
      return this[kClient][kDispatch](opts, handler)
    } catch (err) {
      debug('dispatch error:', err)
      if (typeof handler.onError === 'function') {
        handler.onError(err)
      } else {
        throw err
      }
    }
  }

  async [kClose] () {
    if (this[kClient]) {
      await this[kClient].close()
    }
  }

  async [kDestroy] (err) {
    if (this[kClient]) {
      await this[kClient].destroy(err)
    }
  }
}

module.exports = Socks5ProxyWrapper
