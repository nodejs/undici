'use strict'

const Client = require('./lib/dispatcher/client')
const Dispatcher = require('./lib/dispatcher/dispatcher')
const Pool = require('./lib/dispatcher/pool')
const BalancedPool = require('./lib/dispatcher/balanced-pool')
const Agent = require('./lib/dispatcher/agent')
const ProxyAgent = require('./lib/dispatcher/proxy-agent')
const EnvHttpProxyAgent = require('./lib/dispatcher/env-http-proxy-agent')
const RetryAgent = require('./lib/dispatcher/retry-agent')
const H2CClient = require('./lib/dispatcher/h2c-client')
const errors = require('./lib/core/errors')
const util = require('./lib/core/util')
const { InvalidArgumentError } = errors
const api = require('./lib/api')
const buildConnector = require('./lib/core/connect')
const MockClient = require('./lib/mock/mock-client')
const { MockCallHistory, MockCallHistoryLog } = require('./lib/mock/mock-call-history')
const MockAgent = require('./lib/mock/mock-agent')
const MockPool = require('./lib/mock/mock-pool')
const mockErrors = require('./lib/mock/mock-errors')
const RetryHandler = require('./lib/handler/retry-handler')
const { getGlobalDispatcher, setGlobalDispatcher } = require('./lib/global')
const DecoratorHandler = require('./lib/handler/decorator-handler')
const RedirectHandler = require('./lib/handler/redirect-handler')
const redirect = require('./lib/interceptor/redirect')
const responseError = require('./lib/interceptor/response-error')
const retry = require('./lib/interceptor/retry')
const dump = require('./lib/interceptor/dump')
const dns = require('./lib/interceptor/dns')
const cache = require('./lib/interceptor/cache')
const memoryCacheStore = require('./lib/cache/memory-cache-store')
const sqliteCacheStore = require('./lib/cache/sqlite-cache-store')
const { Headers } = require('./lib/web/fetch/headers')
const { Response } = require('./lib/web/fetch/response')
const { Request } = require('./lib/web/fetch/request')
const { FormData } = require('./lib/web/fetch/formdata')
const { fetch: fetchImpl } = require('./lib/web/fetch')
const { deleteCookie, getCookies, getSetCookies, setCookie, parseCookie } = require('./lib/web/cookies')
const { setGlobalOrigin, getGlobalOrigin } = require('./lib/web/fetch/global')
const { CacheStorage } = require('./lib/web/cache/cachestorage')
const { kConstruct } = require('./lib/core/symbols')
const { parseMIMEType, serializeAMimeType } = require('./lib/web/fetch/data-url')
const { CloseEvent, ErrorEvent, MessageEvent } = require('./lib/web/websocket/events')
const { WebSocket, ping } = require('./lib/web/websocket/websocket')
const { WebSocketStream } = require('./lib/web/websocket/stream/websocketstream')
const { WebSocketError } = require('./lib/web/websocket/stream/websocketerror')
const { EventSource } = require('./lib/web/eventsource/eventsource')

Object.assign(Dispatcher.prototype, api)

const fetch = async function fetch (init, options = undefined) {
  try {
    return await fetchImpl(init, options)
  } catch (err) {
    if (err && typeof err === 'object') {
      Error.captureStackTrace(err)
    }

    throw err
  }
}

function makeDispatcher (fn) {
  return (url, opts, handler) => {
    if (typeof opts === 'function') {
      handler = opts
      opts = null
    }

    if (!url || (typeof url !== 'string' && typeof url !== 'object' && !(url instanceof URL))) {
      throw new InvalidArgumentError('invalid url')
    }

    if (opts != null && typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

    if (opts && opts.path != null) {
      if (typeof opts.path !== 'string') {
        throw new InvalidArgumentError('invalid opts.path')
      }

      let path = opts.path
      if (!opts.path.startsWith('/')) {
        path = `/${path}`
      }

      url = new URL(util.parseOrigin(url).origin + path)
    } else {
      if (!opts) {
        opts = typeof url === 'object' ? url : {}
      }

      url = util.parseURL(url)
    }

    const { agent, dispatcher = getGlobalDispatcher() } = opts

    if (agent) {
      throw new InvalidArgumentError('unsupported opts.agent. Did you mean opts.client?')
    }

    return fn.call(dispatcher, {
      ...opts,
      origin: url.origin,
      path: url.search ? `${url.pathname}${url.search}` : url.pathname,
      method: opts.method || (opts.body ? 'PUT' : 'GET')
    }, handler)
  }
}

// Keep all imports at the top and exports at the bottom.
// Do not use or modify module.exports except for the direct property assignment like below: it confuses bundlers and static analysis tools.

module.exports.Dispatcher = Dispatcher
module.exports.Client = Client
module.exports.Pool = Pool
module.exports.BalancedPool = BalancedPool
module.exports.Agent = Agent
module.exports.ProxyAgent = ProxyAgent
module.exports.EnvHttpProxyAgent = EnvHttpProxyAgent
module.exports.RetryAgent = RetryAgent
module.exports.H2CClient = H2CClient
module.exports.RetryHandler = RetryHandler

module.exports.DecoratorHandler = DecoratorHandler
module.exports.RedirectHandler = RedirectHandler

module.exports.interceptors = {
  redirect,
  responseError,
  retry,
  dump,
  dns,
  cache
}

module.exports.cacheStores = {
  MemoryCacheStore: memoryCacheStore,
  SqliteCacheStore: sqliteCacheStore
}

module.exports.buildConnector = buildConnector
module.exports.errors = errors
module.exports.util = {
  parseHeaders: util.parseHeaders,
  headerNameToString: util.headerNameToString
}

module.exports.setGlobalDispatcher = setGlobalDispatcher
module.exports.getGlobalDispatcher = getGlobalDispatcher

module.exports.fetch = fetch

module.exports.Headers = Headers
module.exports.Response = Response
module.exports.Request = Request
module.exports.FormData = FormData

module.exports.setGlobalOrigin = setGlobalOrigin
module.exports.getGlobalOrigin = getGlobalOrigin

// Cache & CacheStorage are tightly coupled with fetch. Even if it may run
// in an older version of Node, it doesn't have any use without fetch.
module.exports.caches = new CacheStorage(kConstruct)

module.exports.deleteCookie = deleteCookie
module.exports.getCookies = getCookies
module.exports.getSetCookies = getSetCookies
module.exports.setCookie = setCookie
module.exports.parseCookie = parseCookie

module.exports.parseMIMEType = parseMIMEType
module.exports.serializeAMimeType = serializeAMimeType

module.exports.WebSocket = WebSocket
module.exports.CloseEvent = CloseEvent
module.exports.ErrorEvent = ErrorEvent
module.exports.MessageEvent = MessageEvent
module.exports.ping = ping

module.exports.WebSocketStream = WebSocketStream
module.exports.WebSocketError = WebSocketError

module.exports.request = makeDispatcher(api.request)
module.exports.stream = makeDispatcher(api.stream)
module.exports.pipeline = makeDispatcher(api.pipeline)
module.exports.connect = makeDispatcher(api.connect)
module.exports.upgrade = makeDispatcher(api.upgrade)

module.exports.MockClient = MockClient
module.exports.MockCallHistory = MockCallHistory
module.exports.MockCallHistoryLog = MockCallHistoryLog
module.exports.MockPool = MockPool
module.exports.MockAgent = MockAgent
module.exports.mockErrors = mockErrors

module.exports.EventSource = EventSource

module.exports.install = function install () {
  globalThis.fetch = fetch
  globalThis.Headers = Headers
  globalThis.Response = Response
  globalThis.Request = Request
  globalThis.FormData = FormData
  globalThis.WebSocket = WebSocket
  globalThis.CloseEvent = CloseEvent
  globalThis.ErrorEvent = ErrorEvent
  globalThis.MessageEvent = MessageEvent
  globalThis.EventSource = EventSource
}
