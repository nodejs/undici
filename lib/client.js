'use strict'

const { URL } = require('url')
const net = require('net')
const tls = require('tls')
// TODO: This is not really allowed by Node but it works for now.
const { HTTPParser } = process.binding('http_parser') // eslint-disable-line
const EventEmitter = require('events')
const assert = require('assert')
const util = require('./util')
const Request = require('./request')
const {
  ContentLengthMismatchError,
  SocketTimeoutError,
  InvalidArgumentError,
  RequestAbortedError,
  ClientDestroyedError,
  ClientClosedError,
  HeadersTimeoutError,
  SocketError,
  InformationalError
} = require('./errors')
const {
  kUrl,
  kReset,
  kPause,
  kResume,
  kClient,
  kParser,
  kConnect,
  kResuming,
  kWriting,
  kQueue,
  kDrained,
  kServerName,
  kIdleTimeout,
  kSocketTimeout,
  kRequestTimeout,
  kTLSOpts,
  kClosed,
  kDestroyed,
  kPendingIdx,
  kRunningIdx,
  kError,
  kOnDestroyed,
  kPipelining,
  kRetryDelay,
  kRetryTimeout,
  kMaxAbortedPayload,
  kSocket,
  kSocketPath,
  kKeepAliveTimeout,
  kMaxHeadersSize,
  kHeadersTimeout,
  kMaxKeepAliveTimeout,
  kKeepAliveTimeoutThreshold
} = require('./symbols')
const makeStream = require('./client-stream').stream
const makeRequest = require('./client-request').request
const makePipeline = require('./client-pipeline').pipeline
const makeUpgrade = require('./client-upgrade').upgrade
const makeConnect = require('./client-connect').connect

const CRLF = Buffer.from('\r\n', 'ascii')

const nodeMajorVersion = parseInt(process.version.split('.')[0].slice(1))
const insecureHTTPParser = process.execArgv.includes('--insecure-http-parser')

class Client extends EventEmitter {
  constructor (url, {
    maxAbortedPayload,
    maxHeaderSize,
    headersTimeout,
    socketTimeout,
    idleTimeout,
    maxKeepAliveTimeout,
    keepAliveTimeoutThreshold,
    socketPath,
    requestTimeout,
    pipelining,
    tls
  } = {}) {
    super()

    if (typeof url === 'string') {
      url = new URL(url)
    }

    if (!url || typeof url !== 'object') {
      throw new InvalidArgumentError('invalid url')
    }

    if (url.port != null && url.port !== '' && !Number.isFinite(parseInt(url.port))) {
      throw new InvalidArgumentError('invalid port')
    }

    if (socketPath != null && typeof socketPath !== 'string') {
      throw new InvalidArgumentError('invalid socketPath')
    }

    if (url.hostname != null && typeof url.hostname !== 'string') {
      throw new InvalidArgumentError('invalid hostname')
    }

    if (!/https?/.test(url.protocol)) {
      throw new InvalidArgumentError('invalid protocol')
    }

    if (/\/.+/.test(url.pathname) || url.search || url.hash) {
      throw new InvalidArgumentError('invalid url')
    }

    if (maxAbortedPayload != null && !Number.isFinite(maxAbortedPayload)) {
      throw new InvalidArgumentError('invalid maxAbortedPayload')
    }

    if (maxHeaderSize != null && !Number.isFinite(maxHeaderSize)) {
      throw new InvalidArgumentError('invalid maxHeaderSize')
    }

    if (socketTimeout != null && !Number.isFinite(socketTimeout)) {
      throw new InvalidArgumentError('invalid socketTimeout')
    }

    if (idleTimeout != null && (!Number.isFinite(idleTimeout) || idleTimeout <= 0)) {
      throw new InvalidArgumentError('invalid idleTimeout')
    }

    if (maxKeepAliveTimeout != null && (!Number.isFinite(maxKeepAliveTimeout) || maxKeepAliveTimeout <= 0)) {
      throw new InvalidArgumentError('invalid maxKeepAliveTimeout')
    }

    if (keepAliveTimeoutThreshold != null && !Number.isFinite(keepAliveTimeoutThreshold)) {
      throw new InvalidArgumentError('invalid keepAliveTimeoutThreshold')
    }

    if (requestTimeout != null && !Number.isFinite(requestTimeout)) {
      throw new InvalidArgumentError('invalid requestTimeout')
    }

    if (headersTimeout != null && !Number.isFinite(headersTimeout)) {
      throw new InvalidArgumentError('invalid headersTimeout')
    }

    this[kSocket] = null
    this[kReset] = false
    this[kPipelining] = pipelining || 1
    this[kMaxHeadersSize] = maxHeaderSize || 16384
    this[kHeadersTimeout] = headersTimeout == null ? 30e3 : headersTimeout
    this[kUrl] = url
    this[kSocketPath] = socketPath
    this[kSocketTimeout] = socketTimeout == null ? 30e3 : socketTimeout
    this[kMaxKeepAliveTimeout] = maxKeepAliveTimeout == null ? 600e3 : maxKeepAliveTimeout
    this[kIdleTimeout] = idleTimeout == null ? 4e3 : idleTimeout
    this[kKeepAliveTimeoutThreshold] = keepAliveTimeoutThreshold == null ? 1e3 : keepAliveTimeoutThreshold
    this[kKeepAliveTimeout] = this[kIdleTimeout]
    this[kRequestTimeout] = requestTimeout == null ? 30e3 : requestTimeout
    this[kClosed] = false
    this[kDestroyed] = false
    this[kServerName] = null
    this[kTLSOpts] = tls
    this[kRetryDelay] = 0
    this[kRetryTimeout] = null
    this[kOnDestroyed] = []
    this[kWriting] = false
    this[kResuming] = 0 // 0, idle, 1, scheduled, 2 resuming
    this[kDrained] = false
    this[kMaxAbortedPayload] = maxAbortedPayload || 1048576

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

  get pipelining () {
    return this[kPipelining]
  }

  set pipelining (value) {
    this[kPipelining] = value
    resume(this)
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

  get busy () {
    if (this.running >= this[kPipelining]) {
      return true
    }

    if (this.size >= this[kPipelining]) {
      return true
    }

    if (this.size && !this.connected) {
      return true
    }

    if (this[kReset] || this[kWriting]) {
      return true
    }

    if (this[kResuming]) {
      for (let n = this[kPendingIdx]; n < this[kQueue].length; n++) {
        const { idempotent, body, reset, aborted } = this[kQueue][n]
        if (aborted) {
          continue
        }
        if (!idempotent || reset) {
          return true
        }
        if (util.isStream(body) && util.bodyLength(body) !== 0) {
          return true
        }
      }
    } else if (this.pending > 0) {
      return true
    }

    return false
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

  dispatch (opts, handler) {
    const request = new Request(opts, this, handler)
    try {
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
        resume(this)
      }
    } catch (err) {
      request.onError(err)
    }
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

    clearTimeout(this[kRetryTimeout])
    this[kRetryTimeout] = null
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

  request (opts, callback) {
    return makeRequest(this, opts, callback)
  }

  stream (opts, factory, callback) {
    return makeStream(this, opts, factory, callback)
  }

  pipeline (opts, handler) {
    return makePipeline(this, opts, handler)
  }

  upgrade (opts, callback) {
    return makeUpgrade(this, opts, callback)
  }

  connect (opts, callback) {
    return makeConnect(this, opts, callback)
  }
}

class Parser extends HTTPParser {
  constructor (client, socket) {
    /* istanbul ignore next */
    if (nodeMajorVersion >= 12) {
      super()
      this.initialize(
        HTTPParser.RESPONSE,
        {},
        client[kMaxHeadersSize],
        insecureHTTPParser,
        client[kHeadersTimeout]
      )
    } else {
      super(HTTPParser.RESPONSE, false)
    }

    this.client = client
    this.socket = socket

    this.statusCode = null
    this.upgrade = false
    this.headers = null
    this.shouldKeepAlive = false
    this.read = 0
  }

  [HTTPParser.kOnTimeout] () {
    /* istanbul ignore next: https://github.com/nodejs/node/pull/34578 */
    if (this.statusCode) {
      this.socket._unrefTimer()
    } else {
      util.destroy(this.socket, new HeadersTimeoutError())
    }
  }

  [HTTPParser.kOnHeaders] (rawHeaders) {
    if (this.headers) {
      Array.prototype.push.apply(this.headers, rawHeaders)
    } else {
      this.headers = rawHeaders
    }
  }

  [HTTPParser.kOnExecute] (ret) {
    const { upgrade, socket } = this

    if (!Number.isFinite(ret)) {
      assert(ret instanceof Error)
      util.destroy(socket, ret)
      return
    }

    // When the underlying `net.Socket` instance is consumed - no
    // `data` events are emitted, and thus `socket.setTimeout` fires the
    // callback even if the data is constantly flowing into the socket.
    // See, https://github.com/nodejs/node/commit/ec2822adaad76b126b5cccdeaa1addf2376c9aa6
    socket._unrefTimer()

    // This logic cannot live in kOnHeadersComplete since we
    // have no way of slicing the parsing buffer without knowing
    // the offset which is only provided in kOnExecute.
    if (upgrade && !socket.destroyed) {
      const { client, headers, statusCode } = this
      const request = client[kQueue][client[kRunningIdx]]

      assert(!socket.destroyed)
      assert(socket === client[kSocket])
      assert(!socket.isPaused())
      assert(request.upgrade || request.method === 'CONNECT')

      this.read = 0
      this.headers = null
      this.statusCode = null

      // _readableState.flowing might be `true` if the socket has been
      // explicitly `resume()`:d even if we never registered a 'data'
      // listener.

      // We need to stop unshift from emitting 'data'. However, we cannot
      // call pause()  as that will stop socket from automatically resuming
      // when 'data' listener is registered.

      // Reset socket state to non flowing:
      socket._readableState.flowing = null

      socket.unshift(this.getCurrentBuffer().slice(ret))

      request.onUpgrade(statusCode, headers, socket)

      if (!socket.destroyed) {
        detachSocket(socket)

        client[kSocket] = null
        client[kQueue][client[kRunningIdx]++] = null
        client.emit('disconnect', new InformationalError('upgrade'))

        this.unconsume()
        setImmediate(() => this.close())

        resume(client)
      }
    }
  }

  [HTTPParser.kOnHeadersComplete] (versionMajor, versionMinor, rawHeaders, method,
    url, statusCode, statusMessage, upgrade, shouldKeepAlive) {
    const { client, socket } = this
    const request = client[kQueue][client[kRunningIdx]]

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

    if (upgrade !== request.upgrade) {
      util.destroy(socket, new SocketError('bad upgrade'))
      return 1
    }

    if (this.headers) {
      Array.prototype.push.apply(this.headers, rawHeaders)
    } else {
      this.headers = rawHeaders
    }

    this.statusCode = statusCode
    this.shouldKeepAlive = shouldKeepAlive

    if (upgrade || request.method === 'CONNECT') {
      this.upgrade = true
      return 2
    }

    if (!shouldKeepAlive) {
      // Stop more requests from being dispatched.
      client[kReset] = true
    }

    const { headers } = this
    this.headers = null

    // TODO: Have llhttp parse keep-alive timeout?
    let keepAliveTimeout = util.parseKeepAliveTimeout(shouldKeepAlive, headers)

    if (Number.isFinite(keepAliveTimeout)) {
      keepAliveTimeout = Math.min(
        keepAliveTimeout - client[kKeepAliveTimeoutThreshold],
        client[kMaxKeepAliveTimeout]
      )
      if (!keepAliveTimeout || keepAliveTimeout < 1e3) {
        client[kReset] = true
      } else {
        client[kKeepAliveTimeout] = keepAliveTimeout
      }
    } else {
      client[kKeepAliveTimeout] = client[kIdleTimeout]
    }

    request.onHeaders(statusCode, headers, statusCode < 200 ? null : socket[kResume])

    return request.method === 'HEAD' || statusCode < 200 ? 1 : 0
  }

  [HTTPParser.kOnBody] (chunk, offset, length) {
    const { client, socket, statusCode } = this

    if (socket.destroyed) {
      return
    }

    assert(statusCode >= 200)

    const request = client[kQueue][client[kRunningIdx]]

    this.read += length

    // TODO: maxAbortedPayload should count from when aborted
    // not from start.

    const ret = request.onBody(chunk, offset, length)
    if (ret == null) {
      // TODO: Stop more requests from being scheduled, i.e. busy=true
      // until requests has either completed or socket is destroyed.
      if (this.read > client[kMaxAbortedPayload]) {
        client[kQueue][client[kRunningIdx]++] = null
        util.destroy(socket, new InformationalError('max aborted payload'))
      }
    } else if (ret === false) {
      socket.pause()
    }
  }

  [HTTPParser.kOnMessageComplete] () {
    const { client, socket, statusCode, headers, upgrade } = this
    const request = client[kQueue][client[kRunningIdx]]

    if (socket.destroyed) {
      return
    }

    assert(statusCode >= 100)

    if (upgrade) {
      // TODO: When, how and why does this happen?
      assert(statusCode < 300 || request.method === 'CONNECT')
      return
    }

    this.read = 0
    this.statusCode = null
    this.headers = null

    if (statusCode < 200) {
      assert(!socket.isPaused())
      return
    }

    request.onComplete(headers)

    client[kQueue][client[kRunningIdx]++] = null

    if (client[kWriting]) {
      // TOOD: keep writing until maxAbortedPayload?

      // Response completed before request.
      util.destroy(socket, new InformationalError('reset'))
    } else if (client[kReset]) {
      // Destroy socket once all requests have completed.
      // The request at the tail of the pipeline is the one
      // that requested reset and no further requests should
      // have been queued since then.
      if (!client.running) {
        util.destroy(socket, new InformationalError('reset'))
      }
    } else if (!this.shouldKeepAlive) {
      util.destroy(socket, new InformationalError('reset'))
    } else {
      socket.resume()
      resume(client)
    }
  }
}

function onSocketConnect () {
  const { [kClient]: client } = this

  assert(!this.destroyed)
  assert(!client[kWriting])
  assert(!client[kRetryTimeout])

  client[kReset] = false
  client[kRetryDelay] = 0
  client.emit('connect')
  resume(client)
}

function onSocketTimeout () {
  util.destroy(this, new SocketTimeoutError())
}

function onSocketError (err) {
  const { [kClient]: client, [kServerName]: servername } = this

  this[kError] = err

  if (err.code === 'ERR_TLS_CERT_ALTNAME_INVALID') {
    assert(!client.running)
    while (client.pending && client[kQueue][client[kPendingIdx]].servername === servername) {
      client[kQueue][client[kPendingIdx]++].onError(err)
    }
  } else if (
    !client.running &&
    err.code !== 'ECONNRESET' &&
    err.code !== 'ECONNREFUSED' &&
    err.code !== 'EHOSTUNREACH' &&
    err.code !== 'EHOSTDOWN' &&
    err.code !== 'UND_ERR_SOCKET' &&
    err.code !== 'UND_ERR_INFO'
  ) {
    assert(client[kPendingIdx] === client[kRunningIdx])
    // Error is not caused by running request and not a recoverable
    // socket error.
    for (const request of client[kQueue].splice(client[kRunningIdx])) {
      request.onError(err)
    }
  }
}

function onSocketEnd () {
  util.destroy(this, new SocketError('other side closed'))
}

function onSocketClose () {
  const { [kClient]: client, [kParser]: parser } = this

  const err = this[kError] || new SocketError('closed')

  client[kSocket] = null

  parser.unconsume()
  setImmediate(() => parser.close())

  if (client.running > 0) {
    // Retry all idempotent requests except for the one
    // at the head of the pipeline.

    if (err.code !== 'UND_ERR_INFO') {
      client[kQueue][client[kRunningIdx]++].onError(err)
    }

    const retryRequests = []
    for (const request of client[kQueue].slice(client[kRunningIdx], client[kPendingIdx])) {
      const { idempotent, body, aborted } = request
      assert(idempotent && !util.isStream(body))
      if (!aborted) {
        retryRequests.push(request)
      }
    }

    client[kQueue].splice(0, client[kPendingIdx], ...retryRequests)
    client[kPendingIdx] = 0
    client[kRunningIdx] = 0
  }

  if (!client.destroyed) {
    client.emit('disconnect', err)
  }

  resume(client)
}

function detachSocket (socket) {
  socket[kPause] = null
  socket[kResume] = null
  socket[kClient] = null
  socket[kParser] = null
  socket[kError] = null
  socket[kServerName] = null
  socket
    .removeListener('timeout', onSocketTimeout)
    .removeListener('error', onSocketError)
    .removeListener('end', onSocketEnd)
    .removeListener('close', onSocketClose)
}

function connect (client) {
  assert(!client[kSocket])
  assert(!client[kRetryTimeout])

  const { protocol, port, hostname } = client[kUrl]

  let servername = null
  let socket
  if (protocol === 'https:') {
    servername = client[kServerName] || (client[kTLSOpts] && client[kTLSOpts].servername)
    const tlsOpts = { ...client[kTLSOpts], servername }
    /* istanbul ignore next: https://github.com/mcollina/undici/issues/267 */
    socket = client[kSocketPath]
      ? tls.connect(client[kSocketPath], tlsOpts)
      : tls.connect(port || /* istanbul ignore next */ 443, hostname, tlsOpts)
  } else {
    socket = client[kSocketPath]
      ? net.connect(client[kSocketPath])
      : net.connect(port || /* istanbul ignore next */ 80, hostname)
  }

  client[kSocket] = socket

  const parser = new Parser(client, socket)

  /* istanbul ignore next */
  if (nodeMajorVersion >= 12) {
    assert(socket._handle)
    parser.consume(socket._handle)
  } else {
    assert(socket._handle && socket._handle._externalStream)
    parser.consume(socket._handle._externalStream)
  }

  socket[kPause] = socket.pause.bind(socket)
  socket[kResume] = socket.resume.bind(socket)
  socket[kError] = null
  socket[kParser] = parser
  socket[kClient] = client
  socket[kServerName] = servername
  socket
    .setNoDelay(true)
    .setTimeout(client[kIdleTimeout])
    .on(protocol === 'https:' ? 'secureConnect' : 'connect', onSocketConnect)
    .on('timeout', onSocketTimeout)
    .on('error', onSocketError)
    .on('end', onSocketEnd)
    .on('close', onSocketClose)
}

function resume (client) {
  if (client[kResuming] === 2) {
    return
  }

  client[kResuming] = 2
  _resume(client)
  client[kResuming] = 0

  if (client[kRunningIdx] > 256) {
    client[kQueue].splice(0, client[kRunningIdx])
    client[kPendingIdx] -= client[kRunningIdx]
    client[kRunningIdx] = 0
  }
}

function _resume (client) {
  while (true) {
    if (client[kDestroyed]) {
      const err = new ClientDestroyedError()
      for (const request of client[kQueue].splice(client[kPendingIdx])) {
        request.onError(err)
      }
      return
    }

    if (client[kClosed] && !client.size) {
      client.destroy(util.nop)
      continue
    }

    if (client[kSocket]) {
      const timeout = client.running
        ? client[kSocketTimeout]
        : client[kKeepAliveTimeout]

      if (client[kSocket].timeout !== timeout) {
        client[kSocket].setTimeout(timeout)
      }
    }

    if (!client.pending) {
      if (!client[kDrained] && !client.busy) {
        client[kDrained] = true
        client.emit('drain')
        continue
      }
      return
    } else {
      client[kDrained] = false
    }

    if (client.running >= client[kPipelining]) {
      return
    }

    const request = client[kQueue][client[kPendingIdx]]
    if (request.aborted) {
      // Request was aborted.
      // TODO: Avoid splice one by one.
      client[kQueue].splice(client[kPendingIdx], 1)
      continue
    }

    if (client[kServerName] !== request.servername) {
      if (client.running) {
        return
      }

      client[kServerName] = request.servername

      if (client[kSocket]) {
        util.destroy(client[kSocket], new InformationalError('servername changed'))
        return
      }
    }

    if (!client[kSocket] && !client[kRetryTimeout]) {
      if (client[kRetryDelay]) {
        client[kRetryTimeout] = setTimeout(() => {
          client[kRetryTimeout] = null
          connect(client)
        }, client[kRetryDelay])
        client[kRetryDelay] = Math.min(client[kRetryDelay] * 2, client[kSocketTimeout])
      } else {
        connect(client)
        client[kRetryDelay] = 1e3
      }
      return
    }

    if (!client.connected) {
      return
    }

    if (client[kWriting] || client[kReset]) {
      return
    }

    if (client.running && !request.idempotent) {
      // Non-idempotent request cannot be retried.
      // Ensure that no other requests are inflight and
      // could cause failure.
      return
    }

    if (client.running && (request.upgrade || request.method === 'CONNECT')) {
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

    if (client.running && util.isStream(request.body)) {
      // Request with stream body can error while other requests
      // are inflight and indirectly error those as well.
      // Ensure this doesn't happen by waiting for inflight
      // to complete before dispatching.

      // Request with stream body cannot be retried.
      // Ensure that no other requests are inflight and
      // could cause failure.
      return
    }

    try {
      write(client, request)
      client[kPendingIdx]++
    } catch (err) {
      request.onError(err)
    }
  }
}

function write (client, request) {
  const { body, header } = request

  if (body && typeof body.read === 'function') {
    // Try to read EOF in order to get length.
    body.read(0)
  }

  let contentLength = util.bodyLength(body)

  if (contentLength === null) {
    contentLength = request.contentLength
  }

  if (contentLength === 0 && !request.expectsPayload) {
    // https://tools.ietf.org/html/rfc7230#section-3.3.2
    // A user agent SHOULD NOT send a Content-Length header field when
    // the request message does not contain a payload body and the method
    // semantics do not anticipate such a body.

    contentLength = null
  }

  if (request.contentLength !== null && request.contentLength !== contentLength) {
    throw new ContentLengthMismatchError()
  }

  // TODO: Expect: 100-continue

  if (request.reset) {
    client[kReset] = true
  }

  // TODO: An HTTP/1.1 user agent MUST NOT preface
  // or follow a request with an extra CRLF.
  // https://tools.ietf.org/html/rfc7230#section-3.5

  const socket = client[kSocket]

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
    socket.write(CRLF)
    socket.uncork()

    request.body = null
  } else {
    assert(util.isStream(body))
    assert(contentLength !== 0 || !client.running, 'stream body cannot be pipelined')

    let finished = false
    let bytesWritten = 0

    const onData = function (chunk) {
      assert(!finished)

      const len = Buffer.byteLength(chunk)
      if (!len) {
        return
      }

      // TODO: What if not ended and bytesWritten === contentLength?
      // We should defer writing chunks.
      if (contentLength !== null && bytesWritten + len > contentLength) {
        util.destroy(socket, new ContentLengthMismatchError())
        return
      }

      if (bytesWritten === 0) {
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
    /* istanbul ignore next */
    const onClose = function () {
      assert(false, 'socket should not close without error')
    }
    const onFinished = function (err) {
      if (finished) {
        return
      }

      finished = true

      assert(client[kWriting] && client.running <= 1)
      client[kWriting] = false

      if (!err && contentLength !== null && bytesWritten !== contentLength) {
        err = new ContentLengthMismatchError()
      }

      socket
        .removeListener('drain', onDrain)
        .removeListener('error', onFinished)
        .removeListener('close', onClose)
      body
        .removeListener('data', onData)
        .removeListener('end', onFinished)
        .removeListener('error', onFinished)
        .removeListener('close', onAbort)

      request.body = null
      util.destroy(body, err)

      if (err) {
        util.destroy(socket, err)
        return
      }

      if (bytesWritten === 0) {
        if (request.expectsPayload) {
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
      .on('close', onFinished)

    client[kWriting] = true
  }
}

module.exports = Client
