'use strict'

const net = require('net')
const tls = require('tls')
const HTTPParser = require('./llhttp/parser')
const assert = require('assert')
const util = require('./core/util')
const Request = require('./core/request')
const Dispatcher = require('./dispatcher')
const {
  ContentLengthMismatchError,
  TrailerMismatchError,
  InvalidArgumentError,
  RequestAbortedError,
  HeadersTimeoutError,
  HeadersOverflowError,
  ClientDestroyedError,
  ClientClosedError,
  ConnectTimeoutError,
  SocketError,
  InformationalError,
  BodyTimeoutError
} = require('./core/errors')
const {
  kUrl,
  kReset,
  kHost,
  kClient,
  kParser,
  kConnect,
  kResuming,
  kWriting,
  kQueue,
  kNeedDrain,
  kTLSServerName,
  kTLSSession,
  kSetTLSSession,
  kConnectTimeout,
  kConnectTimeoutValue,
  kKeepAliveDefaultTimeout,
  kHostHeader,
  kTLSOpts,
  kClosed,
  kDestroyed,
  kPendingIdx,
  kRunningIdx,
  kError,
  kOnDestroyed,
  kPipelining,
  kSocket,
  kSocketPath,
  kKeepAliveTimeoutValue,
  kMaxHeadersSize,
  kKeepAliveMaxTimeout,
  kKeepAliveTimeoutThreshold,
  kIdleTimeout,
  kIdleTimeoutValue,
  kHeadersTimeout,
  kBodyTimeout,
  kStrictContentLength
} = require('./core/symbols')

const insecureHTTPParser = process.execArgv.includes('--insecure-http-parser')

function getServerName (client, host) {
  return (
    util.getServerName(host) ||
    (client[kTLSOpts] && client[kTLSOpts].servername) ||
    util.getServerName(client[kUrl].host) ||
    null
  )
}

class Client extends Dispatcher {
  constructor (url, {
    maxHeaderSize,
    headersTimeout,
    socketTimeout,
    requestTimeout,
    connectTimeout,
    bodyTimeout,
    idleTimeout,
    keepAlive,
    keepAliveTimeout,
    maxKeepAliveTimeout,
    keepAliveMaxTimeout,
    keepAliveTimeoutThreshold,
    socketPath,
    pipelining,
    tls,
    strictContentLength
  } = {}) {
    super()

    if (keepAlive !== undefined) {
      throw new InvalidArgumentError('unsupported keepAlive, use pipelining=0 instead')
    }

    if (socketTimeout !== undefined) {
      throw new InvalidArgumentError('unsupported socketTimeout, use headersTimeout & bodyTimeout instead')
    }

    if (requestTimeout !== undefined) {
      throw new InvalidArgumentError('unsupported requestTimeout, use headersTimeout & bodyTimeout instead')
    }

    if (idleTimeout !== undefined) {
      throw new InvalidArgumentError('unsupported idleTimeout, use keepAliveTimeout instead')
    }

    if (maxKeepAliveTimeout !== undefined) {
      throw new InvalidArgumentError('unsupported maxKeepAliveTimeout, use keepAliveMaxTimeout instead')
    }

    if (maxHeaderSize != null && !Number.isFinite(maxHeaderSize)) {
      throw new InvalidArgumentError('invalid maxHeaderSize')
    }

    if (socketPath != null && typeof socketPath !== 'string') {
      throw new InvalidArgumentError('invalid socketPath')
    }

    if (connectTimeout != null && (!Number.isFinite(connectTimeout) || connectTimeout < 0)) {
      throw new InvalidArgumentError('invalid keepAliveTimeout')
    }

    if (keepAliveTimeout != null && (!Number.isFinite(keepAliveTimeout) || keepAliveTimeout <= 0)) {
      throw new InvalidArgumentError('invalid keepAliveTimeout')
    }

    if (keepAliveMaxTimeout != null && (!Number.isFinite(keepAliveMaxTimeout) || keepAliveMaxTimeout <= 0)) {
      throw new InvalidArgumentError('invalid keepAliveMaxTimeout')
    }

    if (keepAliveTimeoutThreshold != null && !Number.isFinite(keepAliveTimeoutThreshold)) {
      throw new InvalidArgumentError('invalid keepAliveTimeoutThreshold')
    }

    if (headersTimeout != null && (!Number.isInteger(headersTimeout) || headersTimeout < 0)) {
      throw new InvalidArgumentError('headersTimeout must be a positive integer or zero')
    }

    if (bodyTimeout != null && (!Number.isInteger(bodyTimeout) || bodyTimeout < 0)) {
      throw new InvalidArgumentError('bodyTimeout must be a positive integer or zero')
    }

    this[kSocket] = null
    this[kPipelining] = pipelining != null ? pipelining : 1
    this[kMaxHeadersSize] = maxHeaderSize || 16384
    this[kUrl] = util.parseOrigin(url)
    this[kSocketPath] = socketPath
    this[kConnectTimeoutValue] = connectTimeout == null ? 10e3 : connectTimeout
    this[kConnectTimeout] = null
    this[kKeepAliveDefaultTimeout] = keepAliveTimeout == null ? 4e3 : keepAliveTimeout
    this[kKeepAliveMaxTimeout] = keepAliveMaxTimeout == null ? 600e3 : keepAliveMaxTimeout
    this[kKeepAliveTimeoutThreshold] = keepAliveTimeoutThreshold == null ? 1e3 : keepAliveTimeoutThreshold
    this[kKeepAliveTimeoutValue] = this[kKeepAliveDefaultTimeout]
    this[kClosed] = false
    this[kDestroyed] = false
    this[kTLSOpts] = tls
    this[kTLSServerName] = getServerName(this)
    this[kHost] = null
    this[kOnDestroyed] = []
    this[kResuming] = 0 // 0, idle, 1, scheduled, 2 resuming
    this[kNeedDrain] = 0 // 0, idle, 1, scheduled, 2 resuming
    this[kHostHeader] = `host: ${this[kUrl].hostname}${this[kUrl].port ? `:${this[kUrl].port}` : ''}\r\n`
    this[kBodyTimeout] = bodyTimeout != null ? bodyTimeout : 30e3
    this[kHeadersTimeout] = headersTimeout != null ? headersTimeout : 30e3
    this[kStrictContentLength] = strictContentLength == null ? true : strictContentLength

    this[kTLSSession] = tls && tls.session ? tls.session : null

    // kQueue is built up of 3 sections separated by
    // the kRunningIdx and kPendingIdx indices.
    // |   complete   |   running   |   pending   |
    //                ^ kRunningIdx ^ kPendingIdx ^ kQueue.length
    // kRunningIdx points to the first running element.
    // kPendingIdx points to the first pending element.
    // This implements a fast queue with an amortized
    // time of O(1).

    this[kQueue] = []
    this[kRunningIdx] = 0
    this[kPendingIdx] = 0
  }

  // TODO: Make private?
  get url () {
    return this[kUrl]
  }

  // TODO: Make private?
  get pipelining () {
    return this[kPipelining]
  }

  // TODO: Make private?
  set pipelining (value) {
    this[kPipelining] = value
    resume(this, true)
  }

  get connected () {
    return (
      this[kSocket] &&
      this[kSocket].connecting !== true &&
      // Older versions of Node don't set secureConnecting to false.
      (this[kSocket].authorized !== false ||
       this[kSocket].authorizationError
      ) &&
      !this[kSocket].destroyed
    )
      ? 1
      : 0
  }

  get pending () {
    return this[kQueue].length - this[kPendingIdx]
  }

  get running () {
    return this[kPendingIdx] - this[kRunningIdx]
  }

  get size () {
    return this[kQueue].length - this[kRunningIdx]
  }

  // TODO: Make private?
  get busy () {
    return this[kNeedDrain] > 1
  }

  get destroyed () {
    return this[kDestroyed]
  }

  get closed () {
    return this[kClosed]
  }

  /* istanbul ignore: only used for test */
  [kConnect] (cb) {
    connect(this)
    this.once('connect', cb)
  }

  [kSetTLSSession] (session) {
    this[kTLSSession] = session
    this.emit('session', session)
  }

  dispatch (opts, handler) {
    if (!handler || typeof handler !== 'object') {
      throw new InvalidArgumentError('handler')
    }

    try {
      if (opts.origin && opts.origin !== this[kUrl].origin) {
        throw new InvalidArgumentError('origin')
      }

      const request = new Request(opts, handler)
      if (this[kDestroyed]) {
        throw new ClientDestroyedError()
      }

      if (this[kClosed]) {
        throw new ClientClosedError()
      }

      this[kQueue].push(request)
      if (this[kResuming]) {
        // Do nothing.
      } else if (util.isStream(request.body)) {
        // Wait a tick in case stream is ended in the same tick.
        this[kResuming] = 1
        process.nextTick(resume, this)
      } else {
        resume(this, true)
      }

      if (this[kResuming] && this[kNeedDrain] !== 2 && isBusy(this)) {
        this[kNeedDrain] = 2
      }
    } catch (err) {
      if (typeof handler.onError !== 'function') {
        throw new InvalidArgumentError('invalid onError method')
      }

      handler.onError(err)
    }

    return this[kNeedDrain] < 2
  }

  close (callback) {
    if (callback === undefined) {
      return new Promise((resolve, reject) => {
        this.close((err, data) => {
          return err ? reject(err) : resolve(data)
        })
      })
    }

    if (typeof callback !== 'function') {
      throw new InvalidArgumentError('invalid callback')
    }

    if (this[kDestroyed]) {
      process.nextTick(callback, new ClientDestroyedError(), null)
      return
    }

    this[kClosed] = true

    if (!this.size) {
      this.destroy(callback)
    } else {
      this[kOnDestroyed].push(callback)
    }
  }

  destroy (err, callback) {
    if (typeof err === 'function') {
      callback = err
      err = null
    }

    if (callback === undefined) {
      return new Promise((resolve, reject) => {
        this.destroy(err, (err, data) => {
          return err ? /* istanbul ignore next: should never error */ reject(err) : resolve(data)
        })
      })
    }

    if (typeof callback !== 'function') {
      throw new InvalidArgumentError('invalid callback')
    }

    if (this[kDestroyed]) {
      if (this[kOnDestroyed]) {
        this[kOnDestroyed].push(callback)
      } else {
        process.nextTick(callback, null, null)
      }
      return
    }

    if (!err) {
      err = new ClientDestroyedError()
    }

    for (const request of this[kQueue].splice(this[kPendingIdx])) {
      request.onError(err)
    }

    this[kClosed] = true
    this[kDestroyed] = true
    this[kOnDestroyed].push(callback)

    const onDestroyed = () => {
      const callbacks = this[kOnDestroyed]
      this[kOnDestroyed] = null
      for (const callback of callbacks) {
        callback(null, null)
      }
    }

    if (!this[kSocket]) {
      process.nextTick(onDestroyed)
    } else {
      util.destroy(this[kSocket].on('close', onDestroyed), err)
    }

    resume(this)
  }
}

class Parser extends HTTPParser {
  constructor (client, socket) {
    super(insecureHTTPParser === true)
    this.client = client
    this.socket = socket
    this.timeout = null
    this.statusCode = null
    this.upgrade = false
    this.headers = []
    this.headersSize = 0
    this.headersMaxSize = client[kMaxHeadersSize] = 8 * 1024
    this.shouldKeepAlive = false
    this.request = null
    this.paused = false

    // Parser can't be paused from within a callback.
    // Use a buffer in JS land in order to stop further progress while paused.
    this.resuming = false
    this.queue = []

    this._resume = () => {
      if (!this.paused || this.resuming) {
        return
      }

      const { queue, socket, timeout } = this

      if (timeout && timeout.refresh) {
        timeout.refresh()
      }

      this.paused = false

      this.resuming = true
      while (queue.length) {
        if (socket.destroyed) {
          return
        }

        const [key, ...args] = queue.shift()

        this[key](...args)

        if (this.paused) {
          this.resuming = false
          return
        }
      }
      this.resuming = false

      this.socket.resume()
    }

    this._pause = () => {
      if (this.paused) {
        return
      }

      this.paused = true

      this.socket.pause()
    }

    socket.on('data', onSocketData)
  }

  onHeader (buf, at, len) {
    this.headersSize += len
    if (this.headersSize >= this.headersMaxSize) {
      util.destroy(this.socket, new HeadersOverflowError())
    } else {
      this.headers.push(Buffer.from(buf, at, len).toString())
    }
  }

  [HTTPParser.kOnHeaderField] (buf, at, len) {
    assert(this.headers.length % 2 === 0)
    this.onHeader(buf, at, len)
  }

  [HTTPParser.kOnHeaderValue] (buf, at, len) {
    assert(this.headers.length % 2 === 1)
    this.onHeader(buf, at, len)
  }

  [HTTPParser.kOnUpgrade] (head) {
    const { upgrade, client, socket, paused, queue, request, headers, statusCode } = this

    assert(upgrade)

    if (socket.destroyed) {
      return
    }

    if (paused) {
      queue.push([HTTPParser.kOnUpgrade, head])
      return
    }

    assert(!socket.destroyed)
    assert(socket === client[kSocket])
    assert(!socket.isPaused())
    assert(socket._handle && socket._handle.reading)
    assert(request.upgrade)

    this.statusCode = null
    this.request = null

    // _readableState.flowing might be `true` if the socket has been
    // explicitly `resume()`:d even if we never registered a 'data'
    // listener.

    // We need to stop unshift from emitting 'data'. However, we cannot
    // call pause()  as that will stop socket from automatically resuming
    // when 'data' listener is registered.

    // Reset socket state to non flowing:
    socket._readableState.flowing = null
    socket.unshift(head)

    detachSocket(socket)
    client[kSocket] = null
    client[kQueue][client[kRunningIdx]++] = null
    client.emit('disconnect', client[kUrl], [client], new InformationalError('upgrade'))

    try {
      request.onUpgrade(statusCode, headers, socket)
    } catch (err) {
      util.destroy(socket, err)
    }

    assert(this.headers.length % 2 === 0)
    this.headers = []
    this.headersSize = 0

    resume(client)
  }

  onHeadersComplete (statusCode, shouldKeepAlive) {
    const { client, socket, timeout, headers: rawHeaders } = this

    const request = client[kQueue][client[kRunningIdx]]

    assert(
      timeout || // have timeout
      !client[kHeadersTimeout] || // no timeout
      socket[kWriting], // still writing
      'invalid headers timeout state'
    )

    if (statusCode >= 200) {
      clearTimeout(timeout)
      this.timeout = client[kBodyTimeout]
        ? setTimeout(onBodyTimeout, client[kBodyTimeout], this)
        : null
    } else if (timeout && timeout.refresh) {
      timeout.refresh()
    }

    this.statusCode = statusCode
    this.shouldKeepAlive = shouldKeepAlive
    this.request = request

    if (request.upgrade) {
      this.upgrade = true
      return
    }

    let keepAlive
    let trailers

    for (let n = 0; n < rawHeaders.length; n += 2) {
      const key = rawHeaders[n + 0]
      const val = rawHeaders[n + 1]

      if (!keepAlive && key.length === 10 && key.toLowerCase() === 'keep-alive') {
        keepAlive = val
      } else if (!trailers && key.length === 7 && key.toLowerCase() === 'trailer') {
        trailers = val
      }
    }

    this.trailers = trailers ? trailers.toLowerCase().split(/,\s*/) : null

    if (shouldKeepAlive && client[kPipelining]) {
      const keepAliveTimeout = keepAlive ? util.parseKeepAliveTimeout(keepAlive) : null

      if (keepAliveTimeout != null) {
        const timeout = Math.min(
          keepAliveTimeout - client[kKeepAliveTimeoutThreshold],
          client[kKeepAliveMaxTimeout]
        )
        if (timeout <= 0) {
          socket[kReset] = true
        } else {
          client[kKeepAliveTimeoutValue] = timeout
        }
      } else {
        client[kKeepAliveTimeoutValue] = client[kKeepAliveDefaultTimeout]
      }
    } else {
      // Stop more requests from being dispatched.
      socket[kReset] = true
    }

    try {
      if (request.onHeaders(statusCode, rawHeaders, this._resume) === false) {
        this._pause()
      }
    } catch (err) {
      util.destroy(socket, err)
    }

    assert(this.headers.length % 2 === 0)
    this.headers = []
    this.headersSize = 0
  }

  [HTTPParser.kOnHeadersComplete] (statusCode, upgrade, shouldKeepAlive) {
    const { client, socket } = this

    const request = client[kQueue][client[kRunningIdx]]

    /* istanbul ignore next: difficult to make a test case for */
    if (socket.destroyed) {
      return
    }

    // TODO: Check for content-length mismatch from server?

    assert(!this.upgrade)
    assert(this.statusCode < 200)

    // TODO: More statusCode validation?

    if (statusCode === 100) {
      util.destroy(socket, new SocketError('bad response'))
      return 1
    }

    if (request.upgrade !== true && upgrade !== Boolean(request.upgrade)) {
      util.destroy(socket, new SocketError('bad upgrade'))
      return 1
    }

    if (this.paused) {
      this.queue.push(['onHeadersComplete', statusCode, shouldKeepAlive])
    } else {
      this.onHeadersComplete(statusCode, shouldKeepAlive)
    }

    return request.upgrade ? 2 : request.method === 'HEAD' || statusCode < 200 ? 1 : 0
  }

  [HTTPParser.kOnBody] (buf, at, length) {
    const { socket, statusCode, request, timeout } = this

    if (socket.destroyed) {
      return
    }

    // TODO: we could optimize this further by making this part responsibility fo the user.
    // Forcing them to consume the buffer synchronously or copy it otherwise.
    const chunk = Buffer.from(buf, at, length) // llhttp re-uses buffer so we need to make a copy.

    if (this.paused) {
      this.queue.push([HTTPParser.kOnBody, chunk])
      return
    }

    if (timeout && timeout.refresh) {
      timeout.refresh()
    }

    assert(statusCode >= 200)

    try {
      if (request.onData(chunk) === false) {
        this._pause()
        return false
      }
    } catch (err) {
      util.destroy(socket, err)
    }
  }

  [HTTPParser.kOnMessageComplete] () {
    const { client, socket, statusCode, upgrade, request, trailers, timeout, headers: rawTrailers } = this

    if (socket.destroyed) {
      return
    }

    if (this.paused) {
      this.queue.push([HTTPParser.kOnMessageComplete])
      return
    }

    assert(statusCode >= 100)

    if (upgrade) {
      // TODO: When, how and why does this happen?
      assert(statusCode < 300 || request.method === 'CONNECT')
      return
    }

    assert(this.headers.length % 2 === 0)
    this.headers = []
    this.headersSize = 0
    this.statusCode = null
    this.request = null
    this.trailers = null

    if (statusCode < 200) {
      return
    }

    if (timeout) {
      clearTimeout(timeout)
      this.timeout = null
    }

    try {
      if (trailers) {
        if (!rawTrailers) {
          throw new TrailerMismatchError()
        }

        for (const trailer of trailers) {
          let found = false
          for (let n = 0; n < rawTrailers.length; n += 2) {
            const key = rawTrailers[n + 0]
            if (key.length === trailer.length && key.toLowerCase() === trailer.toLowerCase()) {
              found = true
              break
            }
          }
          if (!found) {
            throw new TrailerMismatchError()
          }
        }
      }

      try {
        request.onComplete(rawTrailers.length ? rawTrailers : null)
      } catch (err) {
        request.onError(err)
      }
    } catch (err) {
      util.destroy(socket, err)
      return
    }

    client[kQueue][client[kRunningIdx]++] = null

    if (socket[kWriting]) {
      // Response completed before request.
      util.destroy(socket, new InformationalError('reset'))
    } else if (!this.shouldKeepAlive) {
      util.destroy(socket, new InformationalError('reset'))
    } else if (socket[kReset] && client.running === 0) {
      // Destroy socket once all requests have completed.
      // The request at the tail of the pipeline is the one
      // that requested reset and no further requests should
      // have been queued since then.
      util.destroy(socket, new InformationalError('reset'))
    } else {
      resume(client)
    }
  }

  destroy () {
    clearTimeout(this.timeout)
    this.timeout = null

    this.close()
  }
}

function onBodyTimeout (self) {
  if (!self.paused) {
    util.destroy(self.socket, new BodyTimeoutError())
  }
}

function onHeadersTimeout (self) {
  assert(!self.paused, 'socket cannot be paused while waiting for headers')
  util.destroy(self.socket, new HeadersTimeoutError())
}

function onSocketConnect () {
  const { [kClient]: client } = this

  clearTimeout(this[kConnectTimeout])
  this[kConnectTimeout] = null

  client.emit('connect', client[kUrl], [client])
  resume(client)
}

function onSocketError (err) {
  const { [kClient]: client } = this

  this[kError] = err

  if (err.code === 'ERR_TLS_CERT_ALTNAME_INVALID') {
    assert(client.running === 0)
    while (client.pending > 0 && client[kQueue][client[kPendingIdx]].host === client[kHost]) {
      client[kQueue][client[kPendingIdx]++].onError(err)
    }
  } else if (
    client.running === 0 &&
    err.code !== 'UND_ERR_INFO' &&
    err.code !== 'UND_ERR_SOCKET'
  ) {
    assert(client[kPendingIdx] === client[kRunningIdx])
    // Error is not caused by running request and not a recoverable
    // socket error.
    for (const request of client[kQueue].splice(client[kRunningIdx])) {
      request.onError(err)
    }
    assert(client.size === 0)
  }
}

function onSocketData (data) {
  const err = this[kParser].execute(data)
  if (err) {
    util.destroy(this, err)
  }
}

function onSocketEnd () {
  util.destroy(this, new SocketError('other side closed'))
}

function detachSocket (socket) {
  clearTimeout(socket[kConnectTimeout])
  socket[kConnectTimeout] = null
  socket[kConnectTimeoutValue] = null

  clearTimeout(socket[kIdleTimeout])
  socket[kIdleTimeout] = null
  socket[kIdleTimeoutValue] = null

  socket[kParser].destroy()
  socket[kParser] = null

  socket[kClient] = null
  socket[kError] = null
  socket
    .removeListener('session', onSocketSession)
    .removeListener('error', onSocketError)
    .removeListener('end', onSocketEnd)
    .removeListener('data', onSocketData)
    .removeListener('close', onSocketClose)
}

function onSocketClose () {
  const { [kClient]: client } = this

  const err = this[kError] || new SocketError('closed')

  detachSocket(this)
  client[kSocket] = null

  if (err.code !== 'UND_ERR_INFO') {
    // Evict session on errors.
    client[kSetTLSSession](null)
  }

  if (client[kDestroyed]) {
    assert(client.pending === 0)

    // Fail entire pipeline.
    for (const request of client[kQueue].splice(client[kRunningIdx])) {
      request.onError(err)
    }
  } else if (client.running > 0 && err.code !== 'UND_ERR_INFO') {
    // Fail head of pipeline.
    client[kQueue][client[kRunningIdx]].onError(err)
    client[kQueue][client[kRunningIdx]++] = null
  }

  client[kPendingIdx] = client[kRunningIdx]

  assert(client.running === 0)

  client.emit('disconnect', client[kUrl], [client], err)

  resume(client)
}

function onSocketSession (session) {
  const { [kClient]: client } = this
  // Cache new session for reuse.
  client[kSetTLSSession](session)
}

function connect (client) {
  assert(!client[kSocket])

  let { protocol, port, hostname } = client[kUrl]

  // Resolve ipv6
  if (hostname.startsWith('[')) {
    const idx = hostname.indexOf(']')

    assert(idx !== -1)
    const ip = hostname.substr(1, idx - 1)

    assert(net.isIP(ip))
    hostname = ip
  }

  let socket
  if (protocol === 'https:') {
    const tlsOpts = {
      ...client[kTLSOpts],
      servername: client[kTLSServerName],
      session: client[kTLSSession]
    }

    /* istanbul ignore next: https://github.com/mcollina/undici/issues/267 */
    socket = client[kSocketPath]
      ? tls.connect(client[kSocketPath], tlsOpts)
      : tls.connect(port || /* istanbul ignore next */ 443, hostname, tlsOpts)

    socket.on('session', onSocketSession)
  } else {
    socket = client[kSocketPath]
      ? net.connect(client[kSocketPath])
      : net.connect(port || /* istanbul ignore next */ 80, hostname)
  }

  client[kSocket] = socket

  const parser = new Parser(client, socket)

  if (client[kConnectTimeoutValue]) {
    socket[kConnectTimeout] = setTimeout((socket) => {
      socket.destroy(new ConnectTimeoutError())
    }, client[kConnectTimeoutValue], socket)
  }

  socket[kIdleTimeout] = null
  socket[kIdleTimeoutValue] = null
  socket[kWriting] = false
  socket[kReset] = false
  socket[kError] = null
  socket[kParser] = parser
  socket[kClient] = client
  socket
    .setNoDelay(true)
    .on(protocol === 'https:' ? 'secureConnect' : 'connect', onSocketConnect)
    .on('error', onSocketError)
    .on('end', onSocketEnd)
    .on('close', onSocketClose)
}

function emitDrain (client) {
  client[kNeedDrain] = 0
  client.emit('drain', client[kUrl], [client])
}

function isBusy (client) {
  const socket = client[kSocket]
  return (
    (socket && (socket[kReset] || socket[kWriting])) ||
    (client.size >= (client[kPipelining] || 1)) ||
    client.pending > 0
  )
}

function resume (client, sync) {
  if (client[kResuming] === 2) {
    return
  }

  client[kResuming] = 2
  _resume(client, sync)
  client[kResuming] = 0

  if (client[kRunningIdx] > 256) {
    client[kQueue].splice(0, client[kRunningIdx])
    client[kPendingIdx] -= client[kRunningIdx]
    client[kRunningIdx] = 0
  }
}

function _resume (client, sync) {
  while (true) {
    if (client[kDestroyed]) {
      assert(client.pending === 0)
      return
    }

    if (client[kClosed] && !client.size) {
      client.destroy(util.nop)
      continue
    }

    const socket = client[kSocket]

    if (socket && client.connected) {
      const timeout = client.running > 0 ? 0 : client[kKeepAliveTimeoutValue]

      if (socket[kIdleTimeoutValue] !== timeout) {
        clearTimeout(socket[kIdleTimeout])
        if (timeout) {
          socket[kIdleTimeout] = setTimeout((socket) => {
            util.destroy(socket, new InformationalError('socket idle timeout'))
          }, timeout, socket)
        }
        socket[kIdleTimeoutValue] = timeout
      }
    }

    if (client.running > 0) {
      const { aborted } = client[kQueue][client[kRunningIdx]]
      if (aborted) {
        assert(socket)
        util.destroy(socket, new InformationalError('abort'))
        return
      }

      if (
        client[kHeadersTimeout] &&
        socket &&
        !socket[kWriting] &&
        !socket[kParser].timeout
      ) {
        socket[kParser].timeout = setTimeout(onHeadersTimeout, client[kHeadersTimeout], socket[kParser])
      }
    }

    if (isBusy(client)) {
      client[kNeedDrain] = 2
    } else if (client[kNeedDrain] === 2) {
      if (sync) {
        client[kNeedDrain] = 1
        process.nextTick(emitDrain, client)
      } else {
        emitDrain(client)
      }
      continue
    }

    if (client.pending === 0) {
      return
    }

    if (client.running >= (client[kPipelining] || 1)) {
      return
    }

    const request = client[kQueue][client[kPendingIdx]]

    if (client[kUrl].protocol === 'https:' && client[kHost] !== request.host) {
      if (client.running > 0) {
        return
      }

      client[kHost] = request.host

      const servername = getServerName(client, request.host)

      if (client[kTLSServerName] !== servername) {
        client[kTLSServerName] = servername
        client[kSetTLSSession](null)

        if (socket) {
          util.destroy(socket, new InformationalError('servername changed'))
          return
        }
      }
    }

    if (!socket) {
      connect(client)
      return
    }

    if (!client.connected) {
      return
    }

    if (socket[kWriting] || socket[kReset]) {
      return
    }

    if (client.running > 0 && !request.idempotent) {
      // Non-idempotent request cannot be retried.
      // Ensure that no other requests are inflight and
      // could cause failure.
      return
    }

    if (client.running > 0 && request.upgrade) {
      // Don't dispatch an upgrade until all preceeding requests have completed.
      // A misbehaving server might upgrade the connection before all pipelined
      // request has completed.
      return
    }

    if (util.isStream(request.body) && util.bodyLength(request.body) === 0) {
      request.body
        .on('data', /* istanbul ignore next */ function () {
          /* istanbul ignore next */
          assert(false)
        })
        .on('error', function (err) {
          request.onError(err)
        })
        .on('end', function () {
          util.destroy(this)
        })

      request.body = null
    }

    if (client.running > 0 && util.isStream(request.body)) {
      // Request with stream body can error while other requests
      // are inflight and indirectly error those as well.
      // Ensure this doesn't happen by waiting for inflight
      // to complete before dispatching.

      // Request with stream body cannot be retried.
      // Ensure that no other requests are inflight and
      // could cause failure.
      return
    }

    if (!request.aborted && write(client, request)) {
      client[kPendingIdx]++
    } else {
      client[kQueue].splice(client[kPendingIdx], 1)
    }
  }
}

function write (client, request) {
  const { body, method, path, host, upgrade, headers } = request

  // https://tools.ietf.org/html/rfc7231#section-4.3.1
  // https://tools.ietf.org/html/rfc7231#section-4.3.2
  // https://tools.ietf.org/html/rfc7231#section-4.3.5

  // Sending a payload body on a request that does not
  // expect it can cause undefined behavior on some
  // servers and corrupt connection state. Do not
  // re-use the connection for further requests.

  const expectsPayload = (
    method === 'PUT' ||
    method === 'POST' ||
    method === 'PATCH'
  )

  if (body && typeof body.read === 'function') {
    // Try to read EOF in order to get length.
    body.read(0)
  }

  let contentLength = util.bodyLength(body)

  if (contentLength === null) {
    contentLength = request.contentLength
  }

  if (contentLength === 0 && !expectsPayload) {
    // https://tools.ietf.org/html/rfc7230#section-3.3.2
    // A user agent SHOULD NOT send a Content-Length header field when
    // the request message does not contain a payload body and the method
    // semantics do not anticipate such a body.

    contentLength = null
  }

  if (request.contentLength !== null && request.contentLength !== contentLength) {
    if (client[kStrictContentLength]) {
      request.onError(new ContentLengthMismatchError())
      return false
    }

    process.emitWarning(new ContentLengthMismatchError())
  }

  if (request.aborted) {
    return false
  }

  try {
    request.onConnect((err) => {
      if (request.aborted) {
        return
      }

      request.onError(err || new RequestAbortedError())
      assert(request.aborted)

      if (client[kResuming] === 0) {
        resume(client, true)
      }
    })
  } catch (err) {
    request.onError(err)
  }

  if (request.aborted) {
    return false
  }

  const socket = client[kSocket]

  if (method === 'HEAD') {
    // https://github.com/mcollina/undici/issues/258

    // Close after a HEAD request to interop with misbehaving servers
    // that may send a body in the response.

    socket[kReset] = true
  }

  if (upgrade) {
    // On CONNECT or upgrade, block pipeline from dispatching further
    // requests on this connection.

    socket[kReset] = true
  }

  // TODO: Expect: 100-continue

  // TODO: An HTTP/1.1 user agent MUST NOT preface
  // or follow a request with an extra CRLF.
  // https://tools.ietf.org/html/rfc7230#section-3.5

  let header

  if (typeof upgrade === 'string') {
    header = `${method} ${path} HTTP/1.1\r\nconnection: upgrade\r\nupgrade: ${upgrade}\r\n`
  } else if (client[kPipelining]) {
    header = `${method} ${path} HTTP/1.1\r\nconnection: keep-alive\r\n`
  } else {
    header = `${method} ${path} HTTP/1.1\r\nconnection: close\r\n`
  }

  if (!host) {
    header += client[kHostHeader]
  }

  if (headers) {
    header += headers
  }

  if (!body) {
    if (contentLength === 0) {
      socket.write(`${header}content-length: ${contentLength}\r\n\r\n\r\n`, 'ascii')
    } else {
      assert(contentLength === null, 'no body must not have content length')
      socket.write(`${header}\r\n`, 'ascii')
    }
  } else if (util.isBuffer(body)) {
    assert(contentLength !== null, 'buffer body must have content length')

    socket.cork()
    socket.write(`${header}content-length: ${contentLength}\r\n\r\n`, 'ascii')
    socket.write(body)
    socket.write('\r\n', 'ascii')
    socket.uncork()

    if (!expectsPayload) {
      socket[kReset] = true
    }
  } else {
    socket[kWriting] = true

    assert(util.isStream(body))
    assert(contentLength !== 0 || client.running === 0, 'stream body cannot be pipelined')

    let finished = false
    let bytesWritten = 0

    const onData = function (chunk) {
      try {
        assert(!finished)

        const len = Buffer.byteLength(chunk)
        if (!len) {
          return
        }

        // TODO: What if not ended and bytesWritten === contentLength?
        // We should defer writing chunks.
        if (contentLength !== null && bytesWritten + len > contentLength) {
          if (client[kStrictContentLength]) {
            util.destroy(socket, new ContentLengthMismatchError())
            return
          }

          process.emitWarning(new ContentLengthMismatchError())
        }

        if (bytesWritten === 0) {
          if (!expectsPayload) {
            socket[kReset] = true
          }

          if (contentLength === null) {
            socket.write(`${header}transfer-encoding: chunked\r\n`, 'ascii')
          } else {
            socket.write(`${header}content-length: ${contentLength}\r\n\r\n`, 'ascii')
          }
        }

        if (contentLength === null) {
          socket.write(`\r\n${len.toString(16)}\r\n`, 'ascii')
        }

        bytesWritten += len

        if (!socket.write(chunk) && this.pause) {
          this.pause()
        }
      } catch (err) {
        util.destroy(this, err)
      }
    }
    const onDrain = function () {
      assert(!finished)

      if (body.resume) {
        body.resume()
      }
    }
    const onAbort = function () {
      onFinished(new RequestAbortedError())
    }
    const onFinished = function (err) {
      if (finished) {
        return
      }

      finished = true

      assert(socket.destroyed || (socket[kWriting] && client.running <= 1))
      socket[kWriting] = false

      if (!err && contentLength !== null && bytesWritten !== contentLength) {
        if (client[kStrictContentLength]) {
          err = new ContentLengthMismatchError()
        } else {
          process.emitWarning(new ContentLengthMismatchError())
        }
      }

      socket
        .removeListener('drain', onDrain)
        .removeListener('error', onFinished)
      body
        .removeListener('data', onData)
        .removeListener('end', onFinished)
        .removeListener('error', onFinished)
        .removeListener('close', onAbort)

      util.destroy(body, err)

      if (err) {
        assert(client.running <= 1, 'pipeline should only contain this request')
        util.destroy(socket, err)
      }

      if (socket.destroyed) {
        return
      }

      if (bytesWritten === 0) {
        if (expectsPayload) {
          // https://tools.ietf.org/html/rfc7230#section-3.3.2
          // A user agent SHOULD send a Content-Length in a request message when
          // no Transfer-Encoding is sent and the request method defines a meaning
          // for an enclosed payload body.

          socket.write(`${header}content-length: 0\r\n\r\n\r\n`, 'ascii')
        } else {
          socket.write(`${header}\r\n`, 'ascii')
        }
      } else if (contentLength === null) {
        socket.write('\r\n0\r\n\r\n', 'ascii')
      }

      resume(client)
    }

    body
      .on('data', onData)
      .on('end', onFinished)
      .on('error', onFinished)
      .on('close', onAbort)

    socket
      .on('drain', onDrain)
      .on('error', onFinished)
  }

  return true
}

module.exports = Client
