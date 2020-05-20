'use strict'

const { URL } = require('url')
const net = require('net')
const tls = require('tls')
const { HTTPParser } = require('http-parser-js')
const EventEmitter = require('events')
const Request = require('./request')
const assert = require('assert')
const {
  Readable,
  Duplex,
  PassThrough,
  finished
} = require('stream')

const {
  TimeoutError,
  InvalidArgumentError,
  RequestAbortedError,
  ClientDestroyedError,
  ClientClosedError,
  SocketError
} = require('./errors')
const {
  kUrl,
  kWriting,
  kQueue,
  kTimeout,
  kTLSOpts,
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
    this.resumeSocket = () => socket.resume()
    this.read = 0
    this.body = null
  }

  [HTTPParser.kOnHeaders] () {

  }

  [HTTPParser.kOnHeadersComplete] ({ statusCode, headers }) {
    const { client, resumeSocket } = this
    const request = client[kQueue][client[kComplete]]
    const skipBody = request.method === 'HEAD'

    assert(!this.read)
    assert(!this.body)

    let body

    if (request.callback) {
      body = request.callback(null, {
        statusCode,
        headers: parseHeaders(headers),
        opaque: request.opaque
      }, resumeSocket)
      request.callback = null
      request.opaque = null
    }

    if (body && skipBody) {
      body(null, null)
      body = null
    }

    if (body) {
      this.body = body

      if (request.signal) {
        const onAbort = () => {
          body(new RequestAbortedError(), null)
        }
        if ('addEventListener' in request.signal) {
          request.signal.addEventListener('abort', onAbort)
        } else {
          request.signal.once('abort', onAbort)
        }
      }
    } else {
      this.next()
    }

    return skipBody
  }

  [HTTPParser.kOnBody] (chunk, offset, length) {
    this.read += length

    const { client, socket, body, read } = this

    const ret = body
      ? body(null, chunk.slice(offset, offset + length))
      : null

    if (ret == null && read > client[kMaxAbortedPayload]) {
      socket.destroy()
    } else if (ret === false) {
      socket.pause()
    }
  }

  [HTTPParser.kOnMessageComplete] () {
    const { body } = this

    this.read = 0
    this.body = null

    if (body) {
      body(null, null)
      this.next()
    }
  }

  next () {
    const { client, resumeSocket } = this

    resumeSocket()

    client[kQueue][client[kComplete]++] = null

    resume(client)
  }

  destroy (err) {
    const { client, body } = this

    assert(err)

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
      } else if (body) {
        body(err, null)
      }
    }

    {
      const retry = []
      for (const request of client[kQueue].slice(client[kComplete], client[kInflight])) {
        const { idempotent, body, callback } = request
        if (!callback) {
          // Aborted
        } else if (idempotent && (!body || typeof body.pipe !== 'function')) {
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

class Client extends EventEmitter {
  constructor (url, {
    maxAbortedPayload,
    timeout,
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

    if (url.port != null && !Number.isFinite(parseInt(url.port))) {
      throw new InvalidArgumentError('invalid port')
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

    if (timeout != null && !Number.isFinite(timeout)) {
      throw new InvalidArgumentError('invalid timeout')
    }

    this[kParser] = null
    this[kSocket] = null
    this[kPipelining] = pipelining || 1
    this[kUrl] = url
    this[kTimeout] = timeout || 30e3
    this[kClosed] = false
    this[kDestroyed] = false
    this[kTLSOpts] = tls
    this[kRetryDelay] = 0
    this[kRetryTimeout] = null
    this[kOnDestroyed] = []
    this[kWriting] = false
    this[kMaxAbortedPayload] = maxAbortedPayload || 1e6

    // kQueue is built up of 3 sections separated by
    // the kComplete and kInflight indices.
    // |   complete   |   running   |   pending   |
    //                ^ kComplete   ^ kInflight   ^ kQueue.length
    // kComplete points to the first running element.
    // kInflight points to the first pending element.
    // This implements a fast queue with an amortized
    // time of O(1).

    this[kQueue] = []
    this[kComplete] = 0
    this[kInflight] = 0
  }

  get pipelining () {
    return this[kPipelining]
  }

  set pipelining (value) {
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

  request (opts, callback) {
    if (callback === undefined) {
      return new Promise((resolve, reject) => {
        this.request(opts, (err, data) => {
          return err ? reject(err) : resolve(data)
        })
      })
    }

    if (typeof callback !== 'function') {
      throw new InvalidArgumentError('invalid callback')
    }

    if (!opts || typeof opts !== 'object') {
      process.nextTick(callback, new InvalidArgumentError('invalid opts'), null)
      return
    }

    this.enqueue(opts, function (err, data, resume) {
      if (err) {
        callback(err, null)
        return
      }

      const body = new Readable({
        autoDestroy: true,
        read: resume,
        destroy (err, callback) {
          if (!err && !this._readableState.endEmitted) {
            err = new RequestAbortedError()
          }
          if (err) {
            process.nextTick(resume)
          }
          callback(err, null)
        }
      })

      // TODO: Do we need wrap here?
      body.destroy = this.wrap(body, body.destroy)

      callback(null, { ...data, body })

      return this.wrap(body, function (err, chunk) {
        if (this.destroyed) {
          return null
        } else if (err) {
          this.destroy(err)
        } else {
          return this.push(chunk)
        }
      })
    })

    return !this.full
  }

  pipeline (opts, handler) {
    if (typeof handler !== 'function') {
      return new PassThrough().destroy(new InvalidArgumentError('invalid handler'))
    }

    let req = new PassThrough({ autoDestroy: true })
    let res
    let body

    const ret = new Duplex({
      autoDestroy: true,
      read () {
        if (body) {
          body.resume()
        }
      },
      write (chunk, encoding, callback) {
        req.write(chunk, encoding, callback)
      },
      final (callback) {
        req.end()
        callback()
      },
      destroy (err, callback) {
        if (req && !req.destroyed) {
          req.destroy(err)
        }
        if (res && !res.destroyed) {
          res.destroy(err)
        }
        callback(err)
      }
    })

    this.enqueue({ ...opts, body: req }, function (err, data, resume) {
      if (err) {
        if (!ret.destroyed) {
          ret.destroy(err)
        }
        return
      }

      req = null
      res = new Readable({
        autoDestroy: true,
        read: resume,
        destroy (err, callback) {
          if (!err && !this._readableState.endEmitted) {
            err = new RequestAbortedError()
          }
          if (err) {
            process.nextTick(resume)
          }
          callback(err, null)
        }
      })

      // TODO: Do we need wrap here?
      res.destroy = this.wrap(res, res.destroy)

      try {
        body = handler({ ...data, body: res })
      } catch (err) {
        if (!ret.destroyed) {
          ret.destroy(err)
        }
        return
      }

      if (!body) {
        // TODO: InvalidReturnValueError?
        if (!ret.destroyed) {
          ret.destroy(new InvalidArgumentError('invalid body'))
        }
        return
      }

      // TODO: If body === res then avoid intermediate
      // and write directly to ret.push? Or should this
      // happen when body is null?

      body
        .on('data', function (chunk) {
          if (!ret.push(chunk)) {
            this.pause()
          }
        })
        .on('error', function (err) {
          if (!ret.destroyed) {
            ret.destroy(err)
          }
        })
        .on('end', function () {
          ret.push(null)
        })
        .on('close', function () {
          if (!ret._readableState.ended && !ret.destroyed) {
            ret.destroy(new RequestAbortedError())
          }
        })

      return this.wrap(res, function (err, chunk) {
        if (this.destroyed) {
          return null
        } else if (err) {
          this.destroy(err)
        } else {
          return this.push(chunk)
        }
      })
    })

    return ret
  }

  stream (opts, factory, callback) {
    if (callback === undefined) {
      return new Promise((resolve, reject) => {
        this.stream(opts, factory, (err, data) => {
          return err ? reject(err) : resolve(data)
        })
      })
    }

    if (typeof callback !== 'function') {
      throw new InvalidArgumentError('invalid callback')
    }

    if (!opts || typeof opts !== 'object') {
      process.nextTick(callback, new InvalidArgumentError('invalid opts'), null)
      return
    }

    if (typeof factory !== 'function') {
      process.nextTick(callback, new InvalidArgumentError('invalid factory'), null)
      return
    }

    this.enqueue(opts, function (err, data, resume) {
      if (err) {
        callback(err)
        return
      }

      let body
      try {
        body = factory(data)
      } catch (err) {
        callback(err, null)
        return
      }

      if (!body) {
        callback(null, null)
        return
      }

      body.on('drain', resume)
      finished(body, { readable: false }, (err) => {
        if (err) {
          if (!body.destroyed) {
            body.destroy(err)
            assert(body.destroyed)
          }
          process.nextTick(resume)
        }
        callback(err, null)
      })

      // TODO: Do we need wrap here?
      body.destroy = this.wrap(body, body.destroy)

      return this.wrap(body, function (err, chunk) {
        if (this.destroyed) {
          return null
        } else if (err) {
          this.destroy(err)
        } else if (chunk == null) {
          this.end()
        } else {
          return this.write(chunk)
        }
      })
    })

    return !this.full
  }

  enqueue (opts, callback) {
    if (this[kDestroyed]) {
      process.nextTick(callback, new ClientDestroyedError(), null)
      return false
    }

    if (this[kClosed]) {
      process.nextTick(callback, new ClientClosedError(), null)
      return false
    }

    if (!this[kSocket]) {
      connect(this)
    }

    try {
      this[kQueue].push(new Request(opts, callback))
      process.nextTick(resume, this)
    } catch (err) {
      process.nextTick(callback, err, null)
    }
  }

  close (cb) {
    if (cb === undefined) {
      return new Promise((resolve, reject) => {
        this.close((err, data) => {
          return err ? reject(err) : resolve(data)
        })
      })
    }

    if (this[kDestroyed]) {
      process.nextTick(cb, new ClientDestroyedError(), null)
      return false
    }

    this[kClosed] = true

    if (!this.size) {
      destroy(this, null, cb)
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

    destroy(this, err, () => cb(null, null))
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
    this.destroy(new TimeoutError())
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
      this.destroy(new SocketError('other side closed'))
    })
    .on('close', function () {
      this[kClosed] = true

      const err = socket[kError] || new SocketError('other side closed')

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

function resume (client) {
  if (client[kDestroyed]) {
    for (const { callback } of client[kQueue].splice(client[kInflight])) {
      if (callback) {
        callback(new ClientDestroyedError(), null)
      }
    }
    return
  }

  if (client.size === 0) {
    if (client[kClosed]) {
      client.destroy(nop)
    } else if (client[kComplete] > 0) {
      client[kQueue].length = 0
      client[kInflight] = 0
      client[kComplete] = 0
      client.emit('drain')
    }
    return
  }

  if (client[kComplete] > 256) {
    client[kQueue].splice(0, client[kComplete])
    client[kInflight] -= client[kComplete]
    client[kComplete] = 0
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
    idempotent,
    callback,
    signal
  } = client[kQueue][client[kInflight]]

  if (!callback) {
    // Request was aborted.
    client[kQueue].splice(client[kInflight], 1)
    resume(client)
    return
  }

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

  const socket = client[kSocket]

  socket.cork()
  socket.write(`${method} ${path} HTTP/1.1\r\nConnection: keep-alive\r\n`, 'ascii')
  if (!host) {
    socket.write('Host: ' + client[kUrl].hostname + '\r\n', 'ascii')
  }
  socket.write(rawHeaders, 'ascii')

  if (body == null) {
    socket.write('\r\n', 'ascii')
    socket.uncork()
    resume(client)
  } else if (typeof body === 'string' || body instanceof Uint8Array) {
    if (chunked) {
      socket.write(`content-length: ${Buffer.byteLength(body)}\r\n\r\n`, 'ascii')
    } else {
      socket.write('\r\n')
    }
    socket.write(body)
    socket.write('\r\n', 'ascii')
    socket.uncork()
    resume(client)
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
    const onAbort = () => {
      onFinished(new RequestAbortedError())
    }
    const onSocketClose = () => {
      onFinished(new SocketError('other side closed'))
    }
    const onFinished = (err) => {
      if (signal) {
        if ('removeEventListener' in signal) {
          signal.removeEventListener('abort', onAbort)
        } else {
          signal.removeListener('abort', onAbort)
        }
      }

      socket
        .removeListener('drain', onDrain)
        .removeListener('error', onFinished)
        .removeListener('close', onSocketClose)
      body
        .removeListener('data', onData)
        .removeListener('end', onFinished)
        .removeListener('error', onFinished)
        .removeListener('close', onAbort)
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
          socket.write('\r\n0\r\n\r\n', 'ascii')
        } else {
          socket.write('\r\n', 'ascii')
        }

        client[kWriting] = false
        resume(client)
      }
    }

    if (signal) {
      if ('addEventListener' in signal) {
        signal.addEventListener('abort', onAbort)
      } else {
        signal.on('abort', onAbort)
      }
    }

    body
      .on('data', onData)
      .on('end', onFinished)
      .on('error', onFinished)
      .on('close', onAbort)

    socket
      .on('drain', onDrain)
      .on('error', onFinished)
      .on('close', onSocketClose)
      .uncork()

    client[kWriting] = true
  } else {
    /* istanbul ignore next */
    assert(false)
  }
}

function destroy (client, err, cb) {
  if (client[kDestroyed]) {
    if (client[kOnDestroyed]) {
      client[kOnDestroyed].push(cb)
    } else {
      process.nextTick(cb, null, null)
    }
    return
  }

  client[kClosed] = true
  client[kDestroyed] = true

  clearTimeout(client[kRetryTimeout])
  client[kRetryTimeout] = null

  const onDestroyed = () => {
    const err = client[kSocket] ? client[kSocket][kError] : null
    const callbacks = client[kOnDestroyed]
    client[kOnDestroyed] = null
    for (const callback of callbacks) {
      callback(err, null)
    }
    cb(err, null)
  }

  if (!client[kSocket] || client[kSocket][kClosed]) {
    process.nextTick(onDestroyed)
  } else {
    client[kSocket]
      .on('close', onDestroyed)
      .destroy(err)
  }

  resume(client)
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
