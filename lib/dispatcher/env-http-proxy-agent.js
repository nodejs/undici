'use strict'

const DispatcherBase = require('./dispatcher-base')
const { kClose, kDestroy, kClosed, kDestroyed, kDispatch, kNoProxyAgent, kHttpProxyAgent, kHttpsProxyAgent } = require('../core/symbols')
const ProxyAgent = require('./proxy-agent')
const Agent = require('./agent')

const DEFAULT_PORTS = {
  'http:': 80,
  'https:': 443
}

class EnvHttpProxyAgent extends DispatcherBase {
  constructor (opts) {
    super()

    this[kNoProxyAgent] = new Agent(opts)

    const HTTP_PROXY = process.env.HTTP_PROXY || process.env.http_proxy
    if (HTTP_PROXY) {
      this[kHttpProxyAgent] = new ProxyAgent({ ...opts, uri: HTTP_PROXY })
    } else {
      this[kHttpProxyAgent] = this[kNoProxyAgent]
    }

    const HTTPS_PROXY = process.env.HTTPS_PROXY || process.env.https_proxy
    if (HTTPS_PROXY) {
      this[kHttpsProxyAgent] = new ProxyAgent({ ...opts, uri: HTTPS_PROXY })
    } else {
      this[kHttpsProxyAgent] = this[kHttpProxyAgent]
    }
  }

  [kDispatch] (opts, handler) {
    const url = new URL(opts.origin)
    const agent = this.#getProxyAgentForUrl(url)
    return agent.dispatch(opts, handler)
  }

  async [kClose] () {
    await this[kNoProxyAgent].close()
    if (!this[kHttpProxyAgent][kClosed]) {
      await this[kHttpProxyAgent].close()
    }
    if (!this[kHttpsProxyAgent][kClosed]) {
      await this[kHttpsProxyAgent].close()
    }
  }

  async [kDestroy] (err) {
    await this[kNoProxyAgent].destroy(err)
    if (!this[kHttpProxyAgent][kDestroyed]) {
      await this[kHttpProxyAgent].destroy(err)
    }
    if (!this[kHttpsProxyAgent][kDestroyed]) {
      await this[kHttpsProxyAgent].destroy(err)
    }
  }

  #getProxyAgentForUrl (url) {
    let { protocol, host: hostname, port } = url

    // Stripping ports in this way instead of using parsedUrl.hostname to make
    // sure that the brackets around IPv6 addresses are kept.
    hostname = hostname.replace(/:\d*$/, '').toLowerCase()
    port = Number.parseInt(port, 10) || DEFAULT_PORTS[protocol] || 0
    if (!this.#shouldProxy(hostname, port)) {
      return this[kNoProxyAgent]
    }
    if (protocol === 'https:') {
      return this[kHttpsProxyAgent]
    }
    return this[kHttpProxyAgent]
  }

  #shouldProxy (hostname, port) {
    const NO_PROXY = process.env.NO_PROXY || process.env.no_proxy
    if (!NO_PROXY) {
      return true // Always proxy if NO_PROXY is not set.
    }
    if (NO_PROXY === '*') {
      return false // Never proxy if wildcard is set.
    }

    return NO_PROXY.split(/[,\s]/).filter((entry) => !!entry.length).every(function (entry) {
      const parsed = entry.match(/^(.+):(\d+)$/)
      let parsedHostname = (parsed ? parsed[1] : entry).toLowerCase()
      const parsedPort = parsed ? Number.parseInt(parsed[2], 10) : 0
      if (parsedPort && parsedPort !== port) {
        return true // Skip if ports don't match.
      }

      if (!/^[.*]/.test(parsedHostname)) {
        // No wildcards, so proxy if there is not an exact match.
        return hostname !== parsedHostname
      }

      if (parsedHostname.startsWith('*')) {
        // Remove leading wildcard.
        parsedHostname = parsedHostname.slice(1)
      }
      // Don't proxy if the hostname ends with the no_proxy host.
      return !hostname.endsWith(parsedHostname)
    })
  }
}

module.exports = EnvHttpProxyAgent
