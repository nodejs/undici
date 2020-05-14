'use strict'

const { URL } = require('url')
const net = require('net')
const tls = require('tls')
const { HTTPParser } = require('http-parser-js')
const EventEmitter = require('events')
const Request = require('./request')
const assert = require('assert')

const {
  kUrl,
  kWriting,
  kQueue,
  kTimeout,
  kTLSOpts,
  kWrite,
  kClosed,
  kDestroyed,
  kInflight,
  kComplete,
  kError,
  kOnDestroyed,
  kPipelining,
  kRetryDelay,
  kRetryTimeout,
  kMaxAbortedPayload,
  kParser,
  kSocket
} = require('./symbols')

function nop () {}

class Parser extends HTTPParser {
  constructor (client, socket) {
    super(HTTPParser.RESPONSE)

    this.client = client
    this.socket = socket
    this.resume = () => socket.resume()
    this.read = 0
    this.body = null
  }

  [HTTPParser.kOnHeaders] () {

  }

  [HTTPParser.kOnHeadersComplete] ({ statusCode, headers }) {
    const { client } = this
    const request = client[kQueue][client[kComplete]]
    const skipBody = request.method === 'HEAD'

    assert(!this.read)
    assert(!this.body)

    let body = request.callback(null, {
      statusCode,
      headers: parseHeaders(headers)
    }, this.resume)
    request.callback = null

    if (body) {
      if (typeof body.write === 'function') {
        body[kWrite] = request.wrapSimple(body, function (chunk) {
          if (chunk == null) {
            this.end()
          } else {
            return this.write(chunk)
          }
        })
      } else if (typeof body.push === 'function') {
        body[kWrite] = request.wrapSimple(body, body.push)
      } else {
        assert(false)
      }

      body.destroy = request.wrapSimple(body, body.destroy)

      if (skipBody) {
        body[kWrite](null)
        body = null
      }
    }

    if (body) {
      this.body = body
    } else {
      this.next()
    }

    return skipBody
  }

  [HTTPParser.kOnBody] (chunk, offset, length) {
    this.read += length
    const { client, socket, body, read } = this
    if (!body || body.destroyed) {
      if (read > client[kMaxAbortedPayload]) {
        socket.destroy()
      }
    } else if (!body[kWrite](chunk.slice(offset, offset + length))) {
      socket.pause()
    }
  }

  [HTTPParser.kOnMessageComplete] () {
    const { body } = this

    this.read = 0
    this.body = null

    if (body && !body.destroyed) {
      body[kWrite](null)
    }

    if (body) {
      this.next()
    }
  }

  next () {
    const { client, socket } = this

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

    if (client[kComplete] >= client[kInflight]) {
      assert(!body)
      return
    }

    this.read = 0
    this.body = null

    // Retry all idempotent requests except for the one
    // at the head of the pipeline.

    {
      const { callback } = client[kQueue][client[kComplete]++]
      if (callback) {
        assert(!body)
        process.nextTick(callback, err, null)
      } else if (body && !body.destroyed) {
        body.destroy(err)
      }
    }

    {
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
    }

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

  client[kSocket] = socket
  client[kParser] = parser

  socket[kClosed] = false
  socket[kError] = null
  socket.setTimeout(client[kTimeout], function () {
    this.destroy(new Error('timeout'))
  })
  socket
    .on('connect', function () {
      client[kRetryDelay] = 0
      client[kRetryTimeout] = null
      client.emit('connect')
      resume(client)
    })
    .on('data', function (chunk) {
      const err = parser.execute(chunk)
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

      const err = socket[kError] || new Error('other side closed')

      parser.destroy(err)

      if (client.destroyed) {
        resume(client)
        return
      }

      // reset events
      client[kSocket].removeAllListeners('data')
      client[kSocket].removeAllListeners('end')
      client[kSocket].removeAllListeners('finish')
      client[kSocket].removeAllListeners('error')
      client[kSocket].on('error', nop)
      client[kSocket] = null
      client[kParser] = null

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
  client[kSocket].write('\r\n', 'ascii')
  client[kSocket].uncork()

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

  const socket = client[kSocket]

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
    const onClose = () => {
      onFinished(new Error('aborted'))
    }
    const onFinished = (err) => {
      socket
        .removeListener('drain', onDrain)
        .removeListener('error', onFinished)
        .removeListener('close', onClose)
      body
        .removeListener('data', onData)
        .removeListener('end', onFinished)
        .removeListener('error', onFinished)
        .removeListener('close', onClose)
        .on('error', nop)

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
      .on('error', onFinished)
      .on('close', onClose)

    socket
      .on('drain', onDrain)
      .on('error', onFinished)
      .on('close', onClose)
      .uncork()
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

    this[kParser] = null
    this[kSocket] = null
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
  }

  get pipelining () {
    return this[kPipelining]
  }

  set pipelinig (value) {
    this[kPipelining] = value
    resume(this)
  }

  get connected () {
    return this[kSocket] && !this[kSocket].connecting && !this[kSocket].destroyed
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

    return this.stream(opts, null, cb)
  }

  stream (opts, factory, cb) {
    if (cb === undefined) {
      return new Promise((resolve, reject) => {
        this.stream(opts, factory, (err, data) => {
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

    if (!this[kSocket]) {
      connect(this)
    }

    try {
      this[kQueue].push(new Request(opts, factory, cb))
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
      const err = this[kSocket] ? this[kSocket][kError] : null
      const callbacks = this[kOnDestroyed]
      this[kOnDestroyed] = null
      for (const callback of callbacks) {
        callback(err, null)
      }
      cb(err, null)
    }

    if (!this[kSocket] || this[kSocket][kClosed]) {
      process.nextTick(onDestroyed)
    } else {
      this[kSocket]
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
