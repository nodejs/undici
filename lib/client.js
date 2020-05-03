'use strict'

/* eslint no-prototype-builtins: "off" */

const { URL } = require('url')
const net = require('net')
const tls = require('tls')
const Q = require('fastq')
const { HTTPParser } = require('http-parser-js')
const { Readable } = require('readable-stream')
const eos = require('end-of-stream')
const retimer = require('retimer')
const { EventEmitter } = require('events')
const Request = require('./request')
const assert = require('assert')

const kRead = Symbol('read')
const kReadCb = Symbol('readCallback')
const kIsWaiting = Symbol('isWaiting')
const kQueue = Symbol('queue')
const kCallbacks = Symbol('callbacks')
const kRequests = Symbol('requests')
const kTimer = Symbol('kTimer')
const kTLSOpts = Symbol('TLS Options')

function connect (client) {
  var socket = null
  var url = client.url
  // the defaults port are needed because of the URL spec
  if (url.protocol === 'https:') {
    socket = tls.connect(url.port || 443, url.hostname, client[kTLSOpts])
  } else {
    socket = net.connect(url.port || 80, url.hostname)
  }

  client.socket = socket

  // stop the queue and reset the parsing state
  client[kQueue].pause()
  client[kIsWaiting] = false
  client._needHeaders = 0
  client._lastBody = null

  socket.on('connect', () => {
    client[kQueue].resume()
  })

  eos(socket, (err) => {
    reconnect(client, err || new Error('other side closed'))
  })
}

function reconnect (client, err) {
  if (client._lastBody) {
    client._lastBody.destroy(err)
    client._lastBody = null
  }

  if (client.closed) {
    // TODO what do we do with the error?
    return
  }

  // reset events
  client.socket.removeAllListeners('end')
  client.socket.removeAllListeners('finish')
  client.socket.removeAllListeners('error')
  client.socket.on('error', () => {})
  client.socket = null

  // we reset the callbacks
  const callbacks = client[kCallbacks]
  client[kCallbacks] = []
  client[kRequests] = []

  if (client[kQueue].length() > 0) {
    connect(client)
  }

  for (const cb of callbacks) {
    cb(err, null)
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

    // state machine, might need more states
    this.closed = false
    this.destroyed = false

    this.parser = new HTTPParser(HTTPParser.RESPONSE)

    this[kTLSOpts] = opts.tls || opts.https

    const endRequest = () => {
      this.socket.write('\r\n', 'ascii')
      this.socket.uncork()
      this._needHeaders++
      this[kRead]()
    }

    this.timeout = opts.timeout || 30000 // 30 seconds
    this[kCallbacks] = []
    this[kRequests] = []

    const timerCb = () => {
      if (this[kCallbacks].length > 0) {
        this.socket.destroy(new Error('timeout'))
        this[kTimer] = null
      }
    }

    this[kQueue] = Q((request, cb) => {
      if (this.destroyed) {
        return cb(new Error('The client is destroyed'))
      }

      if (this[kTimer]) {
        this[kTimer].reschedule(this.timeout)
      } else {
        this[kTimer] = retimer(timerCb, this.timeout)
      }

      var { method, path, body } = request
      const headers = request.headers || {}
      const reqArr = [
        `${method} ${path} HTTP/1.1\r\nConnection: keep-alive\r\n`
      ]

      // wrap the callback in a AsyncResource
      cb = request.wrap(cb)

      this[kRequests].push(request)
      this[kCallbacks].push(cb)
      this.socket.cork()

      if (!(headers.host || headers.Host)) {
        reqArr.push('Host: ' + url.hostname + '\r\n')
      }
      const headerNames = Object.keys(headers)
      for (let i = 0; i < headerNames.length; i++) {
        const name = headerNames[i]
        reqArr.push(name + ': ' + headers[name] + '\r\n')
      }

      for (let i = 0; i < reqArr.length; i++) {
        this.socket.write(reqArr[i], 'ascii')
      }

      const chunked = !headers.hasOwnProperty('content-length')

      if (typeof body === 'string' || body instanceof Uint8Array) {
        if (chunked) {
          this.socket.write(`content-length: ${Buffer.byteLength(body)}\r\n\r\n`, 'ascii')
        } else {
          this.socket.write('\r\n')
        }
        this.socket.write(body)
      } else if (body && typeof body.pipe === 'function') {
        const cleanup = eos(this.socket, err => {
          if (err) {
            body.destroy(err)
          }
        })

        if (chunked) {
          this.socket.write('transfer-encoding: chunked\r\n', 'ascii')
        } else {
          this.socket.write('\r\n', 'ascii')
        }

        // TODO we should pause the queue while we are piping
        const onData = (chunk) => {
          if (chunked) {
            this.socket.write('\r\n' + Buffer.byteLength(chunk).toString(16) + '\r\n')
          }
          if (!this.socket.write(chunk)) {
            body.pause()
          }
        }
        const onDrain = () => {
          body.resume()
        }

        body.on('data', onData)
        this.socket.on('drain', onDrain)

        this.socket.uncork()
        eos(body, (err) => {
          cleanup()
          if (err || !this.socket) {
            // TODO we might want to wait before previous in-flight
            // requests are finished before destroying
            if (this.socket) {
              destroySocket(this.socket, err, cb)
            } else {
              assert(this.closed)
              cb(err, null)
            }
            return
          }

          this.socket.removeListener('drain', onDrain)

          if (chunked) {
            this.socket.cork()
            this.socket.write('\r\n0\r\n', 'ascii')
          }

          endRequest()
        })
        return
      }

      endRequest()
    })

    this.pipelining = opts.pipelining || 1

    this[kQueue].drain = () => {
      if (!this.closed) {
        this.emit('drain')
      }
    }

    this.parser[HTTPParser.kOnHeaders] = () => {}
    this.parser[HTTPParser.kOnHeadersComplete] = ({ statusCode, headers }) => {
      // TODO move this[kCallbacks] from being an array. The array allocation
      // is showing up in the flamegraph.
      const cb = this[kCallbacks].shift()
      const request = this[kRequests].shift()
      const skipBody = request.method === 'HEAD'

      if (!skipBody) {
        this._lastBody = new Readable({ read: this[kRead].bind(this) })
        this._lastBody.push = request.wrapSimple(this._lastBody, this._lastBody.push)
      }
      cb(null, {
        statusCode,
        headers: parseHeaders(headers),
        body: this._lastBody
      })
      destroyMaybe(this)
      return skipBody
    }

    this.parser[HTTPParser.kOnBody] = (chunk, offset, length) => {
      this._lastBody.push(chunk.slice(offset, offset + length))
    }

    this.parser[HTTPParser.kOnMessageComplete] = () => {
      const body = this._lastBody
      this._lastBody = null
      if (body !== null) {
        body.push(null)
      }
      destroyMaybe(this)
    }

    this[kReadCb] = () => {
      this[kIsWaiting] = false
      this[kRead]()
    }
  }

  get pipelining () {
    return this[kQueue].concurrency
  }

  set pipelining (v) {
    this[kQueue].concurrency = v
  }

  get full () {
    // TODO q.length is slowish, optimize
    return this[kQueue].length() > this.pipelining
  }

  [kRead] () {
    var socket = this.socket
    if (!socket) {
      // TODO this should not happen
      return
    }

    var chunk = null
    var hasRead = false
    while ((chunk = socket.read()) !== null) {
      hasRead = true
      this.parser.execute(chunk)
    }

    if (!this[kIsWaiting] && (!hasRead || this._needHeaders > 0)) {
      this[kIsWaiting] = true
      socket.once('readable', this[kReadCb])
    }
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
      process.nextTick(cb, new Error('The client is closed'))
      return false
    }

    if (!this.socket) {
      connect(this)
    }

    try {
      const req = new Request(opts)
      this[kQueue].push(req, cb)
    } catch (err) {
      process.nextTick(cb, err, null)
    }

    return !this.full
  }

  close (cb) {
    if (this.closed) {
      return
    }
    this.closed = true

    // TODO: in-flight should still be able to timeout?
    if (this[kTimer]) {
      this[kTimer].clear()
      this[kTimer] = null
    }

    if (cb) {
      eos(this.socket, (err) => {
        if (err && err.message !== 'premature close') {
          cb(err, null)
        } else {
          cb(null, null)
        }
      })
    }

    // TODO wait for queued requests as well, not just in-flight?

    // TODO test this
    if (
      this[kQueue].length() === 0 &&
      this[kCallbacks].length === 0 &&
      this.socket
    ) {
      this.socket.end()
      // TODO wait util socket is closed before setting to null?
      this.socket = null
    }
  }

  destroy (err) {
    if (this.destroyed) {
      return
    }
    this.closed = true
    this.destroyed = true

    if (this[kTimer]) {
      this[kTimer].clear()
      this[kTimer] = null
    }

    if (this.socket) {
      // TODO make sure we error everything that
      // is in flight
      this.socket.destroy(err)
      this.socket = null
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

function destroyMaybe (client) {
  if (
    client.closed &&
    !client._lastBody &&
    client[kQueue].length() === 0 &&
    client[kCallbacks].length === 0
  ) {
    client.destroy()
  }
}

function destroySocket (socket, err, cb) {
  // This code is basically the same as...
  // stream.finished(socket, er => cb(err || er))
  // socket.destroy(err)
  // ... in Node 14+
  const wState = socket._writableState
  const rState = socket._readableState
  const closed = (wState && wState.closed) || (rState && rState.closed)
  let called = false
  const callback = (er) => {
    if (called) {
      return
    }
    called = true
    cb(err || er, null)
  }
  if (closed === true) {
    socket.on('error', callback)
    process.nextTick(callback)
  } else if (closed === false || !socket.destroyed) {
    eos(socket, callback)
  } else {
    socket.on('error', callback)
    setImmediate(callback)
  }
  socket.destroy(err)
}
