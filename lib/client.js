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

const kQueue = Symbol('queue')
const kInflight = Symbol('inflight')
const kTLSOpts = Symbol('TLS Options')
const kStream = Symbol('stream')
const kClosed = Symbol('closed')
const kError = Symbol('error')
const kDestroyed = Symbol('destroy callbacks')
const kRetryDelay = Symbol('retry delay')
const kRetryTimeout = Symbol('retty timeout')

function nop () {}

function _connect (client) {
  var socket = null
  var url = client.url
  // the defaults port are needed because of the URL spec
  if (url.protocol === 'https:') {
    socket = tls.connect(url.port || 443, url.hostname, client[kTLSOpts])
  } else {
    socket = net.connect(url.port || 80, url.hostname)
  }

  const parser = client._parser = new HTTPParser(HTTPParser.RESPONSE)

  client.socket = socket

  socket[kClosed] = false
  socket[kError] = null
  socket.setTimeout(client.timeout, function () {
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
      const err = parser.execute(chunk)
      if (err instanceof Error) {
        this.destroy(err)
      }
    })
    .on('error', (err) => {
      socket[kError] = err
    })
    .on('close', () => {
      socket[kClosed] = true
    })

  client[kQueue].pause()

  let _body = null
  let _read = 0
  let _callback = null

  parser[HTTPParser.kOnHeaders] = () => {}
  parser[HTTPParser.kOnHeadersComplete] = ({ statusCode, headers }) => {
    // TODO move client[kInflight] from being an array. The array allocation
    // is showing up in the flamegraph.
    const { request, callback, reset } = client[kInflight].shift()
    const skipBody = request.method === 'HEAD'

    if (!skipBody) {
      _body = new client[kStream].Readable({
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
      _body.push = request.wrapSimple(_body, _body.push)
    }

    request.callback(null, {
      statusCode,
      headers: parseHeaders(headers),
      body: _body
    })

    if (skipBody) {
      callback()
    } else {
      _callback = callback
    }

    return skipBody
  }

  parser[HTTPParser.kOnBody] = (chunk, offset, length) => {
    _read += length

    if (_body.destroyed) {
      if (_read > client.maxAbortedPayload) {
        socket.destroy()
      }
    } else if (!_body.push(chunk.slice(offset, offset + length))) {
      socket.pause()
    }
  }

  parser[HTTPParser.kOnMessageComplete] = () => {
    if (_body) {
      // Stop Readable from emitting 'end' when destroyed.
      if (!_body.destroyed) {
        _body.push(null)
      }
      _body = null
      _read = 0
    }

    if (_callback) {
      _callback()
      _callback = null
    }
  }

  client[kStream].finished(socket, (err) => {
    err = err || new Error('other side closed')

    client[kQueue].pause()

    if (_body) {
      _body.destroy(err)
      _body = null
      _read = 0
    }

    if (_callback) {
      _callback()
      _callback = null
    }

    client._parser = null

    // reset callbacks
    for (const { request, callback } of client[kInflight].splice(0)) {
      request.callback(err, null)
      callback()
    }

    if (client.destroyed) {
      // flush queue
      client[kQueue].resume()
      return
    }

    // reset events
    client.socket.removeAllListeners('data')
    client.socket.removeAllListeners('end')
    client.socket.removeAllListeners('finish')
    client.socket.removeAllListeners('error')
    client.socket.on('error', nop)
    client.socket = null

    if (client[kQueue].length() > 0) {
      connect(client)
    }

    client.emit('reconnect')
  })
}

function connect (client) {
  if (client[kRetryDelay]) {
    client[kRetryDelay] = Math.min(client[kRetryDelay], client.timeout)
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

    this.url = url
    this.closed = false
    this.destroyed = false
    this.timeout = opts.timeout || 30e3
    this.maxAbortedPayload = opts.maxAbortedPayload != null
      ? opts.maxAbortedPayload : 1e6

    this[kStream] = opts.stream || require('readable-stream')
    this[kTLSOpts] = opts.tls || opts.https
    this[kInflight] = []
    this[kRetryDelay] = 0
    this[kRetryTimeout] = null
    this[kDestroyed] = []

    const endRequest = () => {
      this.socket.write('\r\n', 'ascii')
      this.socket.uncork()
    }

    this[kQueue] = Q((request, callback) => {
      if (this.destroyed) {
        request.callback(new Error('The client is destroyed'), null)
        callback()
        return
      }

      if (this.socket.destroyed) {
        this[kQueue].pause()
        this[kQueue].unshift(request)
        callback()
        return
      }

      this[kInflight].push({ request, callback })

      const { host, method, path, body, reset, chunked, rawHeaders } = request
      this.socket.cork()
      this.socket.write(`${method} ${path} HTTP/1.1\r\nConnection: keep-alive\r\n`, 'ascii')
      if (!host) {
        this.socket.write('Host: ' + url.hostname + '\r\n', 'ascii')
      }
      this.socket.write(rawHeaders, 'ascii')

      if (reset) {
        // Requests with body we disconnect once response has
        // been received (some servers do this anyway).
        // Queue will automatically resume once reconnected.
        // TODO: Make this less strict?
        this[kQueue].pause()
      }

      if (typeof body === 'string' || body instanceof Uint8Array) {
        if (chunked) {
          this.socket.write(`content-length: ${Buffer.byteLength(body)}\r\n\r\n`, 'ascii')
        } else {
          this.socket.write('\r\n')
        }
        this.socket.write(body)
        endRequest()
      } else if (body && typeof body.pipe === 'function') {
        if (chunked) {
          this.socket.write('transfer-encoding: chunked\r\n', 'ascii')
        } else {
          this.socket.write('\r\n', 'ascii')
        }

        let finished = false

        const socket = this.socket

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

            // TODO we might want to wait before previous in-flight
            // requests are finished before destroying
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
      if (!this.closed) {
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

  request (opts, cb) {
    if (cb === undefined) {
      return new Promise((resolve, reject) => {
        this.request(opts, (err, data) => {
          return err ? reject(err) : resolve(data)
        })
      })
    }

    if (this.closed) {
      process.nextTick(cb, new Error('The client is closed'), null)
      return false
    }

    if (!this.socket) {
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

    this.closed = true
    if (!this.size) {
      this.destroy(null, cb)
    } else {
      this[kDestroyed].push(cb)
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

    if (this.destroyed) {
      if (this[kDestroyed]) {
        this[kDestroyed].push(cb)
      } else {
        process.nextTick(cb, null, null)
      }
      return
    }

    this.closed = true
    this.destroyed = true

    clearTimeout(this[kRetryTimeout])
    this[kRetryTimeout] = null

    const onDestroyed = () => {
      const err = this.socket ? this.socket[kError] : null
      const callbacks = this[kDestroyed]
      this[kDestroyed] = null
      for (const callback of callbacks) {
        callback(err, null)
      }
      cb(err, null)
    }

    if (!this.socket || this.socket[kClosed]) {
      process.nextTick(onDestroyed)
    } else {
      this.socket
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
