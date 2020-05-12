'use strict'

const { URL } = require('url')
const net = require('net')
const tls = require('tls')
const { HTTPParser } = require('http-parser-js')
const { EventEmitter } = require('events')
const Request = require('./request')
const assert = require('assert')
const stream = require('stream')

const kUrl = Symbol('url')
const kWriting = Symbol('writing')
const kQueue = Symbol('queue')
const kTimeout = Symbol('timeout')
const kTLSOpts = Symbol('TLS Options')
const kClosed = Symbol('closed')
const kDestroyed = Symbol('destroyed')
const kInflight = Symbol('inflight')
const kComplete = Symbol('complete')
const kError = Symbol('error')
const kOnDestroyed = Symbol('destroy callbacks')
const kPipelining = Symbol('pipelinig')
const kRetryDelay = Symbol('retry delay')
const kRetryTimeout = Symbol('retry timeout')
const kMaxAbortedPayload = Symbol('max aborted payload')

function nop () {}

class Parser extends HTTPParser {
  constructor (client, socket) {
    super(HTTPParser.RESPONSE)

    this.client = client
    this.socket = socket
    this.read = 0
    this.body = null
    this.bodyRead = function () {
      socket.resume()
    }
    this.bodyDestroy = function (err, cb) {
      socket.resume()

      if (!err && !this._readableState.endEmitted) {
        err = new Error('aborted')
      }

      cb(err, null)
    }
  }

  [HTTPParser.kOnHeaders] () {

  }

  [HTTPParser.kOnHeadersComplete] ({ statusCode, headers }) {
    const { client } = this
    const request = client[kQueue][client[kComplete]]
    const skipBody = request.method === 'HEAD'

    const body = new stream.Readable({
      autoDestroy: true,
      read: this.bodyRead,
      destroy: this.bodyDestroy
    })
    body.push = request.wrapSimple(body, body.push)

    this.body = body
    this.read = 0

    request.callback(null, {
      statusCode,
      headers: parseHeaders(headers),
      body
    })

    if (skipBody) {
      this[HTTPParser.kOnMessageComplete]()
    }

    return skipBody
  }

  [HTTPParser.kOnBody] (chunk, offset, length) {
    this.read += length
    const { client, socket, body, read } = this

    if (body.destroyed) {
      if (read > client[kMaxAbortedPayload]) {
        socket.destroy()
      }
    } else if (!body.push(chunk.slice(offset, offset + length))) {
      socket.pause()
    }
  }

  [HTTPParser.kOnMessageComplete] () {
    const { client, socket, body } = this

    if (!body) {
      return
    }

    this.body = null
    this.read = 0

    if (body.destroyed) {
      // Stop Readable from emitting 'end' when destroyed.
    } else {
      body.push(null)
    }

    socket.resume()

    client[kQueue][client[kComplete]++] = null
    if (client[kComplete] > 256) {
      client[kQueue].splice(0, client[kComplete])
      client[kInflight] -= client[kComplete]
      client[kComplete] = 0
    }

    resume(client)
  }

  destroy (err) {
    const { client, body } = this

    this.body = null
    this.read = 0

    if (body && !body.destroyed) {
      body.destroy(err)
    }

    if (body) {
      client[kComplete]++
    }

    if (!body && client[kInflight] > client[kComplete]) {
      const { callback } = client[kQueue][client[kComplete]++]
      process.nextTick(callback, err, null)
    }

    const retry = []
    for (const request of client[kQueue].slice(client[kComplete], client[kInflight])) {
      const { idempotent, body, callback } = request
      if (idempotent && (!body || typeof body.pipe !== 'function')) {
        retry.push(request)
      } else {
        process.nextTick(callback, err, null)
      }
    }
    client[kQueue].splice(0, client[kInflight], ...retry)
    client[kInflight] = 0
    client[kComplete] = 0

    resume(client)
  }
}

function _connect (client) {
  const { protocol, port, hostname } = client[kUrl]
  const socket = protocol === 'https:'
    ? tls.connect(port || 443, hostname, client[kTLSOpts])
    : net.connect(port || 80, hostname)
  const parser = new Parser(client, socket)

  client._socket = socket
  client._parser = parser

  socket[kClosed] = false
  socket[kError] = null
  socket.setTimeout(client[kTimeout], function () {
    this.destroy(new Error('timeout'))
  })
  socket
    .on('connect', () => {
      client[kRetryDelay] = 0
      client[kRetryTimeout] = null
      client.emit('connect')
      resume(client)
    })
    .on('data', function (chunk) {
      const err = client._parser.execute(chunk)
      if (err instanceof Error && !this.destroyed) {
        this.destroy(err)
      }
    })
    .on('error', function (err) {
      this[kError] = err
    })
    .on('end', function () {
      this.destroy(new Error('other side closed'))
    })
    .on('close', function () {
      this[kClosed] = true
    })

  stream.finished(socket, (err) => {
    err = err || new Error('other side closed')

    parser.destroy(err)
    socket.destroy(err)

    if (client.destroyed) {
      resume(client)
      return
    }

    // reset events
    client._socket.removeAllListeners('data')
    client._socket.removeAllListeners('end')
    client._socket.removeAllListeners('finish')
    client._socket.removeAllListeners('error')
    client._socket.on('error', nop)
    client._socket = null
    client._parser = null

    if (client.pending > 0) {
      connect(client)
    }

    client.emit('reconnect')
  })
}

function connect (client) {
  if (client[kRetryDelay]) {
    client[kRetryDelay] = Math.min(client[kRetryDelay], client[kTimeout])
    client[kRetryTimeout] = setTimeout(() => {
      _connect(client)
    }, client[kRetryDelay])
    client[kRetryDelay] *= 2
  } else {
    _connect(client)
    client[kRetryDelay] = 1e3
  }
}

const endRequest = (client) => {
  client._socket.write('\r\n', 'ascii')
  client._socket.uncork()

  client[kWriting] = false
  resume(client)
}

function resume (client) {
  if (client[kDestroyed]) {
    for (const { callback } of client[kQueue].splice(client[kInflight])) {
      callback(new Error('The client is destroyed'), null)
    }
    return
  }

  if (client.size === 0) {
    client[kQueue].length = 0
    client[kInflight] = 0
    client[kComplete] = 0

    if (!client[kClosed]) {
      client.emit('drain')
    } else {
      client.destroy(nop)
    }
    return
  }

  if (client.running >= client.pipelining) {
    return
  }

  if (!client.pending) {
    return
  }

  if (!client.connected) {
    return
  }

  if (client[kWriting]) {
    return
  }

  const {
    host,
    method,
    path,
    body,
    chunked,
    rawHeaders,
    idempotent
  } = client[kQueue][client[kInflight]]

  if (!idempotent && client.running) {
    // Non-idempotent request cannot be retried.
    // Ensure that no other requests are inflight and
    // could cause failure.
    return
  }

  if ((body && typeof body.pipe === 'function') && client.running) {
    // Request with stream body can error while other requests
    // are inflight and indirectly error those as well.
    // Ensure this doesn't happen by waiting for inflight
    // to complete before dispatching.

    // TODO: This is too strict. Would be better if when
    // request body fails, the client waits for inflight
    // before resetting the connection.
    return
  }

  client[kInflight]++
  client[kWriting] = true

  const socket = client._socket

  socket.cork()
  socket.write(`${method} ${path} HTTP/1.1\r\nConnection: keep-alive\r\n`, 'ascii')
  if (!host) {
    socket.write('Host: ' + client[kUrl].hostname + '\r\n', 'ascii')
  }
  socket.write(rawHeaders, 'ascii')

  if (typeof body === 'string' || body instanceof Uint8Array) {
    if (chunked) {
      socket.write(`content-length: ${Buffer.byteLength(body)}\r\n\r\n`, 'ascii')
    } else {
      socket.write('\r\n')
    }
    socket.write(body)
    endRequest(client)
  } else if (body && typeof body.pipe === 'function') {
    if (chunked) {
      socket.write('transfer-encoding: chunked\r\n', 'ascii')
    } else {
      socket.write('\r\n', 'ascii')
    }

    let finished = false

    const onData = (chunk) => {
      if (chunked) {
        socket.write('\r\n' + Buffer.byteLength(chunk).toString(16) + '\r\n')
      }
      if (!socket.write(chunk)) {
        body.pause()
      }
    }
    const onDrain = () => {
      body.resume()
    }
    const onFinished = (err) => {
      if (finished) {
        return
      }
      finished = true

      freeSocketFinished()
      freeBodyFinished()

      socket
        .removeListener('drain', onDrain)
      body
        .removeListener('data', onData)
        .removeListener('end', onFinished)

      if (err) {
        if (typeof body.destroy === 'function' && !body.destroyed) {
          body.destroy(err)
        }

        if (!socket.destroyed) {
          socket.destroy(err)
        }

        client[kWriting] = false
        resume(client)
      } else {
        if (chunked) {
          socket.cork()
          socket.write('\r\n0\r\n', 'ascii')
        }

        endRequest(client)
      }
    }

    body
      .on('data', onData)
      .on('end', onFinished)
      .on('error', nop)

    socket
      .on('drain', onDrain)
      .uncork()

    const freeSocketFinished = stream.finished(socket, onFinished)
    const freeBodyFinished = stream.finished(body, onFinished)
  } else {
    assert(!body)
    endRequest(client)
  }
}

class Client extends EventEmitter {
  constructor (url, opts = {}) {
    super()

    if (!(url instanceof URL)) {
      url = new URL(url)
    }

    if (!/https?/.test(url.protocol)) {
      throw new Error('invalid url')
    }

    if (/\/.+/.test(url.pathname) || url.search || url.hash) {
      throw new Error('invalid url')
    }

    if (opts.maxAbortedPayload != null && !Number.isFinite(opts.maxAbortedPayload)) {
      throw new Error('invalid maxAbortedPayload')
    }

    if (opts.timeout != null && !Number.isFinite(opts.timeout)) {
      throw new Error('invalid timeout')
    }

    this[kPipelining] = opts.pipelining || 1
    this[kUrl] = url
    this[kTimeout] = opts.timeout || 30e3
    this[kClosed] = false
    this[kDestroyed] = false
    this[kTLSOpts] = opts.tls || opts.https
    this[kRetryDelay] = 0
    this[kRetryTimeout] = null
    this[kOnDestroyed] = []
    this[kWriting] = false
    this[kQueue] = []
    this[kInflight] = 0
    this[kComplete] = 0
    this[kMaxAbortedPayload] = opts.maxAbortedPayload != null
      ? opts.maxAbortedPayload : 1e6

    // Semi private for tests.
    // TODO: Share symbols with tests?
    this._parser = null
    this._socket = null
  }

  get pipelining () {
    return this[kPipelining]
  }

  set pipelinig (value) {
    this[kPipelining] = value
    resume(this)
  }

  get connected () {
    return this._socket && !this._socket.connecting && !this._socket.destroyed
  }

  get pending () {
    return this[kQueue].length - this[kInflight]
  }

  get running () {
    return this[kInflight] - this[kComplete]
  }

  get size () {
    return this[kQueue].length - this[kComplete]
  }

  get full () {
    return this.size > this[kPipelining]
  }

  get destroyed () {
    return this[kDestroyed]
  }

  get closed () {
    return this[kClosed]
  }

  request (opts, cb) {
    if (cb === undefined) {
      return new Promise((resolve, reject) => {
        this.request(opts, (err, data) => {
          return err ? reject(err) : resolve(data)
        })
      })
    }

    if (this[kClosed]) {
      process.nextTick(cb, new Error('The client is closed'), null)
      return false
    }

    if (this[kDestroyed]) {
      process.nextTick(cb, new Error('The client is destroyed'), null)
      return false
    }

    if (!this._socket) {
      connect(this)
    }

    try {
      this[kQueue].push(new Request(opts, cb))
      resume(this)
    } catch (err) {
      process.nextTick(cb, err, null)
    }

    return !this.full
  }

  close (cb) {
    if (cb === undefined) {
      return new Promise((resolve, reject) => {
        this.close((err, data) => {
          return err ? reject(err) : resolve(data)
        })
      })
    }

    this[kClosed] = true

    if (!this.size) {
      this.destroy(null, cb)
    } else {
      resume(this)
      this[kOnDestroyed].push(cb)
    }
  }

  destroy (err, cb) {
    if (typeof err === 'function') {
      cb = err
      err = null
    }

    if (cb === undefined) {
      return new Promise((resolve, reject) => {
        this.destroy(err, (err, data) => {
          return err ? reject(err) : resolve(data)
        })
      })
    }

    if (this[kDestroyed]) {
      if (this[kOnDestroyed]) {
        this[kOnDestroyed].push(cb)
      } else {
        process.nextTick(cb, null, null)
      }
      return
    }

    this[kClosed] = true
    this[kDestroyed] = true

    clearTimeout(this[kRetryTimeout])
    this[kRetryTimeout] = null

    const onDestroyed = () => {
      const err = this._socket ? this._socket[kError] : null
      const callbacks = this[kOnDestroyed]
      this[kOnDestroyed] = null
      for (const callback of callbacks) {
        callback(err, null)
      }
      cb(err, null)
    }

    if (!this._socket || this._socket[kClosed]) {
      process.nextTick(onDestroyed)
    } else {
      this._socket
        .on('close', onDestroyed)
        .destroy(err)
    }

    resume(this)
  }
}

function parseHeaders (headers) {
  const obj = {}
  for (var i = 0; i < headers.length; i += 2) {
    var key = headers[i]
    var val = obj[key]
    if (!val) {
      obj[key] = headers[i + 1]
    } else {
      if (!Array.isArray(val)) {
        val = [val]
        obj[key] = val
      }
      val.push(headers[i + 1])
    }
  }
  return obj
}

module.exports = Client
