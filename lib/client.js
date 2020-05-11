'use strict'

/* eslint no-prototype-builtins: "off" */

const { URL } = require('url')
const net = require('net')
const tls = require('tls')
const Q = require('fastq')
const { HTTPParser } = require('http-parser-js')
const { EventEmitter } = require('events')
const Request = require('./request')
const assert = require('assert')

const kUrl = Symbol('url')
const kQueue = Symbol('queue')
const kTimeout = Symbol('timeout')
const kTLSOpts = Symbol('TLS Options')
const kStream = Symbol('stream')
const kClosed = Symbol('closed')
const kDestroyed = Symbol('destroyed')
const kError = Symbol('error')
const kOnDestroyed = Symbol('destroy callbacks')
const kRetryDelay = Symbol('retry delay')
const kRetryTimeout = Symbol('retry timeout')
const kMaxAbortedPaylot = Symbol('max aborted payload')

function nop () {}

class Parser extends HTTPParser {
  constructor (client, socket) {
    super(HTTPParser.RESPONSE)

    this.client = client
    this.socket = socket
    this.body = null
    this.reset = false
    this.read = 0
    this.callback = null
    this.inflight = []
  }

  [HTTPParser.kOnHeaders] () {

  }

  [HTTPParser.kOnHeadersComplete] ({ statusCode, headers }) {
    const { client, socket } = this
    // TODO move client[kInflight] from being an array. The array allocation
    // is showing up in the flamegraph.
    const { request, callback, reset } = this.inflight.shift()
    const skipBody = request.method === 'HEAD'

    const body = new client[kStream].Readable({
      autoDestroy: true,
      read () {
        socket.resume()
      },
      destroy (err, cb) {
        if (reset) {
          socket.destroy()
        } else {
          socket.resume()
        }

        if (!err && !this._readableState.endEmitted) {
          err = new Error('aborted')
        }

        cb(err, null)
      }
    })
    body.push = request.wrapSimple(body, body.push)

    request.callback(null, {
      statusCode,
      headers: parseHeaders(headers),
      body
    })

    this.body = body
    this.callback = callback
    this.reset = reset
    this.read = 0

    if (skipBody) {
      this[HTTPParser.kOnMessageComplete]()
    }

    return skipBody
  }

  [HTTPParser.kOnBody] (chunk, offset, length) {
    this.read += length
    const { client, socket, body, read } = this

    if (body.destroyed) {
      if (read > client[kMaxAbortedPaylot]) {
        socket.destroy()
      }
    } else if (!body.push(chunk.slice(offset, offset + length))) {
      socket.pause()
    }
  }

  [HTTPParser.kOnMessageComplete] (err) {
    const { client, socket, body, callback, reset } = this

    if (!body) {
      return
    }

    this.body = null
    this.callback = null
    this.reset = false
    this.read = 0

    if (err) {
      body.destroy(err)
    } else if (body.destroyed) {
      // Stop Readable from emitting 'end' when destroyed.
    } else {
      body.push(null)
    }

    if (reset) {
      socket.destroy(err)
    } else {
      socket.resume()
    }

    callback()
    client[kQueue].resume()
  }
}

function _connect (client) {
  var socket = null
  var url = client[kUrl]
  // the defaults port are needed because of the URL spec
  if (url.protocol === 'https:') {
    socket = tls.connect(url.port || 443, url.hostname, client[kTLSOpts])
  } else {
    socket = net.connect(url.port || 80, url.hostname)
  }

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
      client[kQueue].resume()
    })
    .on('data', function (chunk) {
      const err = client._parser.execute(chunk)
      if (err instanceof Error) {
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

  client[kQueue].pause()

  client[kStream].finished(socket, (err) => {
    parser[HTTPParser.kOnMessageComplete](err)

    // reset callbacks
    for (const { request, callback } of parser.inflight.splice(0)) {
      request.callback(err, null)
      callback()
    }

    if (client.destroyed) {
      // flush queue
      client[kQueue].resume()
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

    if (client[kQueue].length() > 0) {
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

    this[kUrl] = url
    this[kTimeout] = opts.timeout || 30e3
    this[kClosed] = false
    this[kDestroyed] = false
    this[kStream] = opts.stream || require('readable-stream')
    this[kTLSOpts] = opts.tls || opts.https
    this[kRetryDelay] = 0
    this[kRetryTimeout] = null
    this[kOnDestroyed] = []
    this[kMaxAbortedPaylot] = opts.maxAbortedPayload != null
      ? opts.maxAbortedPayload : 1e6

    // Semi private for tests.
    // TODO: Share symbols with tests?
    this._parser = null
    this._socket = null

    const endRequest = () => {
      this._socket.write('\r\n', 'ascii')
      this._socket.uncork()
    }

    this[kQueue] = Q((request, callback) => {
      if (this[kDestroyed]) {
        request.callback(new Error('The client is destroyed'), null)
        callback()
        return
      }

      if (this._socket.destroyed) {
        // Socket is being destroyed. Wait for connection to be reset.

        this[kQueue].pause()
        this[kQueue].unshift(request)
        callback()
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
      } = request

      if (!idempotent && this[kQueue].running() > 1) {
        // Non-idempotent request cannot be retried.
        // Ensure that no other requests are inflight and
        // could cause failure.

        this[kQueue].pause()
        this[kQueue].unshift(request)
        callback()
        return
      }

      if ((body && typeof body.pipe === 'function') && this[kQueue].running() > 1) {
        // Request with stream body can error while other requests
        // are inflight and indirectly error those as well.
        // Ensure this doesn't happen by waiting for inflight
        // to complete before dispatching.

        // TODO: This is too strict. Would be better if when
        // request body fails, the client waits for inflight
        // before resetting the connection.

        this[kQueue].pause()
        this[kQueue].unshift(request)
        callback()
        return
      }

      let reset = false

      if (body) {
        // Some servers disconnect requests with body even after
        // successful completion. Assume this always happens and
        // explicitly reset the connection once response has been
        // received. Queue will automatically resume once reconnected.

        // TODO: This is too strict. Try to figure out when/how/why some
        // servers do this.

        reset = true
        this[kQueue].pause()
      }

      this._parser.inflight.push({ request, callback, reset })

      this._socket.cork()
      this._socket.write(`${method} ${path} HTTP/1.1\r\nConnection: keep-alive\r\n`, 'ascii')
      if (!host) {
        this._socket.write('Host: ' + url.hostname + '\r\n', 'ascii')
      }
      this._socket.write(rawHeaders, 'ascii')

      if (typeof body === 'string' || body instanceof Uint8Array) {
        if (chunked) {
          this._socket.write(`content-length: ${Buffer.byteLength(body)}\r\n\r\n`, 'ascii')
        } else {
          this._socket.write('\r\n')
        }
        this._socket.write(body)
        endRequest()
      } else if (body && typeof body.pipe === 'function') {
        if (chunked) {
          this._socket.write('transfer-encoding: chunked\r\n', 'ascii')
        } else {
          this._socket.write('\r\n', 'ascii')
        }

        let finished = false

        const socket = this._socket

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
            if (typeof body.destroy === 'function') {
              body.destroy(err)
            }

            socket.destroy(err)
          } else {
            if (chunked) {
              socket.cork()
              socket.write('\r\n0\r\n', 'ascii')
            }

            endRequest()
          }
        }

        body
          .on('data', onData)
          .on('end', onFinished)
          .on('error', nop)

        socket
          .on('drain', onDrain)
          .uncork()

        const freeSocketFinished = this[kStream].finished(socket, onFinished)
        const freeBodyFinished = this[kStream].finished(body, onFinished)
      } else {
        assert(!body)
        endRequest()
      }
    })

    this.pipelining = opts.pipelining || 1

    this[kQueue].drain = () => {
      if (!this[kClosed]) {
        this.emit('drain')
      } else {
        this.destroy(nop)
      }
    }

    this[kQueue].pause()
  }

  get pipelining () {
    return this[kQueue].concurrency
  }

  set pipelining (v) {
    this[kQueue].concurrency = v
  }

  get size () {
    // TODO q.length is slowish, optimize
    return this[kQueue].length() + this[kQueue].running()
  }

  get full () {
    return this.size > this.pipelining
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

    if (!this._socket) {
      connect(this)
    }

    try {
      this[kQueue].push(new Request(opts, cb))
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
