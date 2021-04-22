'use strict'

/* global WebAssembly */

const net = require('net')
const tls = require('tls')
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

const { resolve } = require('path')
const { readFileSync } = require('fs')
const constants = require('./llhttp/constants')
const WASM_BUILD = resolve(__dirname, './llhttp/llhttp.wasm')
const EMPTY_BUF = Buffer.alloc(0)
const bin = readFileSync(WASM_BUILD)
const mod = new WebAssembly.Module(bin)

const {
  kUrl,
  kReset,
  kHost,
  kClient,
  kBusy,
  kParser,
  kConnect,
  kResuming,
  kRunning,
  kPending,
  kSize,
  kWriting,
  kQueue,
  kConnected,
  kConnecting,
  kNeedDrain,
  kTLSServerName,
  kTLSSession,
  kSetTLSSession,
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
  kHeadersTimeout,
  kBodyTimeout,
  kStrictContentLength
} = require('./core/symbols')

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
      throw new InvalidArgumentError('invalid connectTimeout')
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
  get pipelining () {
    return this[kPipelining]
  }

  // TODO: Make private?
  set pipelining (value) {
    this[kPipelining] = value
    resume(this, true)
  }

  get destroyed () {
    return this[kDestroyed]
  }

  get closed () {
    return this[kClosed]
  }

  get [kPending] () {
    return this[kQueue].length - this[kPendingIdx]
  }

  get [kRunning] () {
    return this[kPendingIdx] - this[kRunningIdx]
  }

  get [kSize] () {
    return this[kQueue].length - this[kRunningIdx]
  }

  get [kConnected] () {
    return this[kSocket] && !this[kSocket][kConnecting] && !this[kSocket].destroyed ? 1 : 0
  }

  /* istanbul ignore: only used for test */
  get [kBusy] () {
    const socket = this[kSocket]
    return (
      (socket && (socket[kReset] || socket[kWriting])) ||
      (this[kSize] >= (this[kPipelining] || 1)) ||
      this[kPending] > 0
    )
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

      if (this[kResuming] && this[kNeedDrain] !== 2 && this[kBusy]) {
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

    if (!this[kSize]) {
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

    const requests = this[kQueue].splice(this[kPendingIdx])
    for (let i = 0; i < requests.length; i++) {
      const request = requests[i]
      request.onError(err)
      assert(request.aborted)
    }

    this[kClosed] = true
    this[kDestroyed] = true
    this[kOnDestroyed].push(callback)

    const onDestroyed = () => {
      const callbacks = this[kOnDestroyed]
      this[kOnDestroyed] = null
      for (let i = 0; i < callbacks.length; i++) {
        callbacks[i](null, null)
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

class HTTPParserError extends Error {
  constructor (message, code, data) {
    super(message)
    Error.captureStackTrace(this, HTTPParserError)
    this.name = 'HTTPParserError'
    this.code = code ? `HPE_${code}` : undefined
    this.data = data.toString()
  }
}

const llhttp = new WebAssembly.Instance(mod, {
  env: {
    /* eslint-disable camelcase */

    wasm_on_header_field: (p, at, len) => {
      assert.strictEqual(currentParser.ptr, p)
      const start = at - currentBufferPtr
      const end = start + len
      return currentParser.onHeaderField(currentBufferRef.slice(start, end)) || 0
    },
    wasm_on_header_value: (p, at, len) => {
      assert.strictEqual(currentParser.ptr, p)
      const start = at - currentBufferPtr
      const end = start + len
      return currentParser.onHeaderValue(currentBufferRef.slice(start, end)) || 0
    },
    wasm_on_headers_complete: (p, statusCode, upgrade, shouldKeepAlive) => {
      assert.strictEqual(currentParser.ptr, p)
      return currentParser.onHeadersComplete(statusCode, Boolean(upgrade), Boolean(shouldKeepAlive)) || 0
    },
    wasm_on_body: (p, at, len) => {
      assert.strictEqual(currentParser.ptr, p)
      const start = at - currentBufferPtr
      const end = start + len
      return currentParser.onBody(currentBufferRef.slice(start, end)) || 0
    },
    wasm_on_message_complete: (p) => {
      assert.strictEqual(currentParser.ptr, p)
      return currentParser.onMessageComplete() || 0
    }

    /* eslint-enable camelcase */
  }
})

let currentParser = null
let currentBufferRef = null
let currentBufferSize = 16384
let currentBufferPtr = llhttp.exports.malloc(currentBufferSize)
let currentBufferView = new Uint8Array(llhttp.exports.memory.buffer, currentBufferPtr, currentBufferSize)

const TIMEOUT_HEADERS = 1
const TIMEOUT_BODY = 2
const TIMEOUT_IDLE = 3
const TIMEOUT_CONNECT = 4

class Parser {
  constructor (client, socket) {
    assert(Number.isFinite(client[kMaxHeadersSize]) && client[kMaxHeadersSize] > 0)

    this.ptr = llhttp.exports.llhttp_alloc(constants.TYPE.RESPONSE)
    this.client = client
    this.socket = socket
    this.timeout = null
    this.timeoutValue = null
    this.timeoutType = null
    this.statusCode = null
    this.upgrade = false
    this.headers = []
    this.headersSize = 0
    this.headersMaxSize = client[kMaxHeadersSize]
    this.shouldKeepAlive = false
    this.paused = false
    this.resume = this.resume.bind(this)
  }

  setTimeout (value, type) {
    this.timeoutType = type
    if (value !== this.timeoutValue) {
      clearTimeout(this.timeout)
      this.timeout = value ? setTimeout(onParserTimeout, value, this) : null
      this.timeoutValue = value
    } else if (this.timeout) {
      // istanbul ignore else: only for jest
      if (this.timeout.refresh) {
        this.timeout.refresh()
      }
    }
  }

  resume () {
    if (this.socket.destroyed || !this.paused) {
      return
    }

    assert(this.ptr != null)
    assert(currentParser == null)

    llhttp.exports.llhttp_resume(this.ptr)

    assert(this.timeoutType === TIMEOUT_BODY)
    if (this.timeout) {
      // istanbul ignore else: only for jest
      if (this.timeout.refresh) {
        this.timeout.refresh()
      }
    }

    this.paused = false
    this.socket.resume()
    this.execute(EMPTY_BUF) // Flush parser.
  }

  execute (data) {
    assert(this.ptr != null)
    assert(currentParser == null)
    assert(!this.paused)

    const { socket } = this

    if (data.length > currentBufferSize) {
      llhttp.exports.free(currentBufferPtr)
      currentBufferSize = Math.ceil(data.length / 4096) * 4096
      currentBufferPtr = llhttp.exports.malloc(currentBufferSize)
      currentBufferView = new Uint8Array(llhttp.exports.memory.buffer, currentBufferPtr, currentBufferSize)
    }

    // TODO (perf): Can we avoid this copy somehow?
    currentBufferView.set(data)

    // Call `execute` on the wasm parser.
    // We pass the `llhttp_parser` pointer address, the pointer address of buffer view data,
    // and finally the length of bytes to parse.
    // The return value is an error code or `constants.ERROR.OK`.
    currentBufferRef = data
    currentParser = this
    const ret = llhttp.exports.llhttp_execute(this.ptr, currentBufferPtr, data.length)
    currentParser = null
    currentBufferRef = null

    if (ret === constants.ERROR.PAUSED_UPGRADE) {
      const offset = llhttp.exports.llhttp_get_error_pos(this.ptr) - currentBufferPtr
      this.onUpgrade(data.slice(offset))
    } else if (ret === constants.ERROR.PAUSED) {
      const offset = llhttp.exports.llhttp_get_error_pos(this.ptr) - currentBufferPtr
      this.paused = true
      socket.pause()
      socket.unshift(data.slice(offset))
    } else if (ret !== constants.ERROR.OK) {
      const ptr = llhttp.exports.llhttp_get_error_reason(this.ptr)
      let message = ''
      if (ptr) {
        const len = new Uint8Array(llhttp.exports.memory.buffer, ptr).indexOf(0)
        message = Buffer.from(llhttp.exports.memory.buffer, ptr, len).toString()
      }
      util.destroy(socket, new HTTPParserError(message, constants.ERROR[ret], data))
    }
  }

  destroy () {
    assert(this.ptr != null)
    assert(currentParser == null)

    llhttp.exports.llhttp_free(this.ptr)
    this.ptr = null

    clearTimeout(this.timeout)
    this.timeout = null
    this.timeoutValue = null
    this.timeoutType = null

    this.paused = false
  }

  onHeaderField (buf) {
    const len = this.headers.length

    if ((len & 1) === 0) {
      this.headers.push(buf)
    } else {
      this.headers[len - 1] = Buffer.concat([this.headers[len - 1], buf])
    }

    this.trackHeader(buf.length)
  }

  onHeaderValue (buf) {
    const len = this.headers.length

    if ((len & 1) === 1) {
      this.headers.push(buf)
    } else {
      this.headers[len - 1] = Buffer.concat([this.headers[len - 1], buf])
    }

    this.trackHeader(buf.length)
  }

  trackHeader (len) {
    this.headersSize += len
    if (this.headersSize >= this.headersMaxSize) {
      util.destroy(this.socket, new HeadersOverflowError())
    }
  }

  onUpgrade (head) {
    const { upgrade, client, socket, headers, statusCode } = this

    assert(upgrade)

    const request = client[kQueue][client[kRunningIdx]]
    assert(request)

    assert(!socket.destroyed)
    assert(socket === client[kSocket])
    assert(!socket.isPaused())
    assert(socket._handle && socket._handle.reading)
    assert(request.upgrade || request.method === 'CONNECT')

    this.statusCode = null
    this.shouldKeepAlive = null

    assert(this.headers.length % 2 === 0)
    this.headers = []
    this.headersSize = 0

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

    resume(client)
  }

  onHeadersComplete (statusCode, upgrade, shouldKeepAlive) {
    const { client, socket, headers: rawHeaders } = this

    /* istanbul ignore next: difficult to make a test case for */
    if (socket.destroyed) {
      return -1
    }

    const request = client[kQueue][client[kRunningIdx]]
    assert(request)

    // TODO: Check for content-length mismatch from server?

    assert(!this.upgrade)
    assert(this.statusCode < 200)

    // TODO: More statusCode validation?

    if (statusCode === 100) {
      util.destroy(socket, new SocketError('bad response'))
      return -1
    }

    /* istanbul ignore if: this can only happen if server is misbehaving */
    if (upgrade && !request.upgrade) {
      util.destroy(socket, new SocketError('bad upgrade'))
      return -1
    }

    assert.strictEqual(this.timeoutType, TIMEOUT_HEADERS)

    this.statusCode = statusCode
    this.shouldKeepAlive = shouldKeepAlive

    if (this.statusCode >= 200) {
      const bodyTimeout = request.bodyTimeout != null
        ? request.bodyTimeout
        : client[kBodyTimeout]
      this.setTimeout(bodyTimeout, TIMEOUT_BODY)
    } else if (this.timeout) {
      // istanbul ignore else: only for jest
      if (this.timeout.refresh) {
        this.timeout.refresh()
      }
    }

    if (request.method === 'CONNECT' && statusCode >= 200 && statusCode < 300) {
      assert(client[kRunning] === 1)
      this.upgrade = true
      return 2
    }

    if (upgrade) {
      assert(client[kRunning] === 1)
      this.upgrade = true
      return 2
    }

    assert(this.headers.length % 2 === 0)
    this.headers = []
    this.headersSize = 0

    let keepAlive
    let trailers

    let looking = true
    for (let n = 0; n < rawHeaders.length && looking; n += 2) {
      const key = rawHeaders[n]
      const val = rawHeaders[n + 1]

      if (!keepAlive && key.length === 10 && key.toString().toLowerCase() === 'keep-alive') {
        keepAlive = val
        looking = !trailers
      } else if (!trailers && key.length === 7 && key.toString().toLowerCase() === 'trailer') {
        trailers = val
        looking = !keepAlive
      }
    }

    this.trailers = trailers ? trailers.toString().toLowerCase().split(/,\s*/) : []

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
      if (request.onHeaders(statusCode, rawHeaders, this.resume) === false) {
        return constants.ERROR.PAUSED
      }
    } catch (err) {
      util.destroy(socket, err)
    }

    if (request.method === 'HEAD') {
      assert(socket[kReset])
      return 1
    }

    if (statusCode < 200) {
      return 1
    }
  }

  onBody (buf) {
    const { client, socket, statusCode } = this

    if (socket.destroyed) {
      return -1
    }

    const request = client[kQueue][client[kRunningIdx]]
    assert(request)

    assert.strictEqual(this.timeoutType, TIMEOUT_BODY)
    if (this.timeout) {
      // istanbul ignore else: only for jest
      if (this.timeout.refresh) {
        this.timeout.refresh()
      }
    }

    assert(statusCode >= 200)

    try {
      if (request.onData(buf) === false) {
        return constants.ERROR.PAUSED
      }
    } catch (err) {
      util.destroy(socket, err)
    }
  }

  onMessageComplete () {
    const { client, socket, statusCode, upgrade, trailers, headers: rawTrailers } = this

    if (socket.destroyed) {
      return -1
    }

    if (upgrade) {
      return
    }

    const request = client[kQueue][client[kRunningIdx]]
    assert(request)

    assert(statusCode >= 100)

    this.statusCode = null
    this.trailers = null

    assert(this.headers.length % 2 === 0)
    this.headers = []
    this.headersSize = 0

    if (statusCode < 200) {
      return
    }

    for (let i = 0; i < trailers.length; i++) {
      const trailer = trailers[i]
      let found = false
      for (let n = 0; n < rawTrailers.length; n += 2) {
        const key = rawTrailers[n]
        if (key.length === trailer.length && key.toString().toLowerCase() === trailer.toLowerCase()) {
          found = true
          break
        }
      }
      if (!found) {
        util.destroy(socket, new TrailerMismatchError())
        return -1
      }
    }

    try {
      request.onComplete(rawTrailers.length ? rawTrailers : null)
    } catch (err) {
      request.onError(err)
      assert(request.aborted)
    }

    client[kQueue][client[kRunningIdx]++] = null

    if (socket[kWriting]) {
      // Response completed before request.
      util.destroy(socket, new InformationalError('reset'))
      // TODO: return -1?
    } else if (!this.shouldKeepAlive) {
      util.destroy(socket, new InformationalError('reset'))
      // TODO: return -1?
    } else if (socket[kReset] && client[kRunning] === 0) {
      // Destroy socket once all requests have completed.
      // The request at the tail of the pipeline is the one
      // that requested reset and no further requests should
      // have been queued since then.
      util.destroy(socket, new InformationalError('reset'))
      // TODO: return -1?
    } else {
      resume(client)
    }
  }
}

function onParserTimeout (parser) {
  const { socket, timeoutType, client } = parser

  /* istanbul ignore else */
  if (timeoutType === TIMEOUT_HEADERS) {
    if (!socket[kWriting]) {
      assert(!socket.isPaused(), 'socket cannot be paused while waiting for headers')
      util.destroy(socket, new HeadersTimeoutError())
    }
  } else if (timeoutType === TIMEOUT_BODY) {
    if (!parser.paused) {
      util.destroy(socket, new BodyTimeoutError())
    }
  } else if (timeoutType === TIMEOUT_IDLE) {
    assert(client[kRunning] === 0 && client[kKeepAliveTimeoutValue])
    util.destroy(socket, new InformationalError('socket idle timeout'))
  } else if (timeoutType === TIMEOUT_CONNECT) {
    assert(!client[kConnected])
    util.destroy(socket, new ConnectTimeoutError())
  }
}

function onSocketData (data) {
  const { [kParser]: parser } = this
  parser.execute(data)
}

function onSocketConnect () {
  const { [kClient]: client } = this

  this[kConnecting] = false
  client.emit('connect', client[kUrl], [client])
  resume(client)
}

function onSocketError (err) {
  const { [kClient]: client } = this

  this[kError] = err

  if (err.code === 'ERR_TLS_CERT_ALTNAME_INVALID') {
    assert(client[kRunning] === 0)
    while (client[kPending] > 0 && client[kQueue][client[kPendingIdx]].host === client[kHost]) {
      const request = client[kQueue][client[kPendingIdx]++]
      request.onError(err)
      assert(request.aborted)
    }
  } else if (
    client[kRunning] === 0 &&
    err.code !== 'UND_ERR_INFO' &&
    err.code !== 'UND_ERR_SOCKET'
  ) {
    assert(client[kPendingIdx] === client[kRunningIdx])
    // Error is not caused by running request and not a recoverable
    // socket error.

    const requests = client[kQueue].splice(client[kRunningIdx])
    for (let i = 0; i < requests.length; i++) {
      const request = requests[i]
      request.onError(err)
      assert(request.aborted)
    }
    assert(client[kSize] === 0)
  }
}

function onSocketEnd () {
  util.destroy(this, new SocketError('other side closed'))
}

function detachSocket (socket) {
  socket[kParser].destroy()
  socket[kParser] = null

  socket[kClient] = null
  socket[kError] = null
  socket
    .removeListener('session', onSocketSession)
    .removeListener('error', onSocketError)
    .removeListener('data', onSocketData)
    .removeListener('end', onSocketEnd)
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
    assert(client[kPending] === 0)

    // Fail entire queue.
    const requests = client[kQueue].splice(client[kRunningIdx])
    for (let i = 0; i < requests.length; i++) {
      const request = requests[i]
      request.onError(err)
      assert(request.aborted)
    }
  } else if (client[kRunning] > 0 && err.code !== 'UND_ERR_INFO') {
    // Fail head of pipeline.
    const request = client[kQueue][client[kRunningIdx]]
    client[kQueue][client[kRunningIdx]++] = null

    request.onError(err)
    assert(request.aborted)
  }

  client[kPendingIdx] = client[kRunningIdx]

  assert(client[kRunning] === 0)

  this[kConnecting] = false
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

  socket[kConnecting] = true
  socket[kWriting] = false
  socket[kReset] = false
  socket[kError] = null
  socket[kParser] = new Parser(client, socket)
  socket[kClient] = client
  socket
    .setNoDelay(true)
    .on(protocol === 'https:' ? 'secureConnect' : 'connect', onSocketConnect)
    .on('error', onSocketError)
    .on('data', onSocketData)
    .on('end', onSocketEnd)
    .on('close', onSocketClose)
}

function emitDrain (client) {
  client[kNeedDrain] = 0
  client.emit('drain', client[kUrl], [client])
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
      assert(client[kPending] === 0)
      return
    }

    if (client[kClosed] && !client[kSize]) {
      client.destroy(util.nop)
      continue
    }

    const socket = client[kSocket]

    if (socket) {
      if (socket[kConnecting]) {
        if (socket[kParser].timeoutType !== TIMEOUT_CONNECT) {
          socket[kParser].setTimeout(client[kConnectTimeoutValue], TIMEOUT_CONNECT)
        }
      } else if (client[kSize] === 0) {
        if (socket[kParser].timeoutType !== TIMEOUT_IDLE) {
          socket[kParser].setTimeout(client[kKeepAliveTimeoutValue], TIMEOUT_IDLE)
        }
      } else if (client[kRunning] > 0 && socket[kParser].statusCode < 200) {
        if (socket[kParser].timeoutType !== TIMEOUT_HEADERS) {
          const request = client[kQueue][client[kRunningIdx]]
          const headersTimeout = request.headersTimeout != null
            ? request.headersTimeout
            : client[kHeadersTimeout]
          socket[kParser].setTimeout(headersTimeout, TIMEOUT_HEADERS)
        }
      }
    }

    if (client[kBusy]) {
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

    if (client[kPending] === 0) {
      return
    }

    if (client[kRunning] >= (client[kPipelining] || 1)) {
      return
    }

    const request = client[kQueue][client[kPendingIdx]]

    if (client[kUrl].protocol === 'https:' && client[kHost] !== request.host) {
      if (client[kRunning] > 0) {
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
      continue
    }

    if (socket.destroyed || socket[kConnecting] || socket[kWriting] || socket[kReset]) {
      return
    }

    if (client[kRunning] > 0 && !request.idempotent) {
      // Non-idempotent request cannot be retried.
      // Ensure that no other requests are inflight and
      // could cause failure.
      return
    }

    if (client[kRunning] > 0 && (request.upgrade || request.method === 'CONNECT')) {
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
          assert(request.aborted)
        })
        .on('end', function () {
          util.destroy(this)
        })

      request.body = null
    }

    if (client[kRunning] > 0 && util.isStream(request.body)) {
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
      assert(request.aborted)
      return false
    }

    process.emitWarning(new ContentLengthMismatchError())
  }

  const socket = client[kSocket]

  try {
    request.onConnect((err) => {
      if (request.aborted || request.completed) {
        return
      }

      request.onError(err || new RequestAbortedError())
      assert(request.aborted)

      socket.destroy(new InformationalError('aborted'))
    })
  } catch (err) {
    request.onError(err)
    assert(request.aborted)
  }

  if (request.aborted) {
    return false
  }

  if (method === 'HEAD') {
    // https://github.com/mcollina/undici/issues/258

    // Close after a HEAD request to interop with misbehaving servers
    // that may send a body in the response.

    socket[kReset] = true
  }

  if (upgrade || method === 'CONNECT') {
    // On CONNECT or upgrade, block pipeline from dispatching further
    // requests on this connection.

    socket[kReset] = true
  }

  // TODO: Expect: 100-continue

  // TODO: An HTTP/1.1 user agent MUST NOT preface
  // or follow a request with an extra CRLF.
  // https://tools.ietf.org/html/rfc7230#section-3.5

  let header

  if (upgrade) {
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
    assert(contentLength !== 0 || client[kRunning] === 0, 'stream body cannot be pipelined')

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

      assert(socket.destroyed || (socket[kWriting] && client[kRunning] <= 1))
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

      // TODO (fix): Avoid using err.message for logic.
      if (err && (err.code !== 'UND_ERR_INFO' || err.message !== 'reset')) {
        util.destroy(body, err)
      } else {
        util.destroy(body)
      }

      if (err) {
        assert(client[kRunning] <= 1, 'pipeline should only contain this request')
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

      assert.strictEqual(socket[kParser].timeoutType, TIMEOUT_HEADERS)
      if (socket[kParser].timeout) {
        // istanbul ignore else: only for jest
        if (socket[kParser].timeout.refresh) {
          socket[kParser].timeout.refresh()
        }
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
