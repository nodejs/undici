'use strict'

/* eslint no-prototype-builtins: "off" */

const { URL } = require('url')
const net = require('net')
const tls = require('tls')
const Q = require('fastq')
const { HTTPParser } = require('http-parser-js')
const { Readable } = require('readable-stream')
const eos = require('end-of-stream')
const syncthrough = require('syncthrough')
const retimer = require('retimer')
const { EventEmitter } = require('events')
const Request = require('./request')

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

  socket.on('end', () => {
    reconnect(client, new Error('other side closed - ended'))
  })

  socket.on('finish', () => {
    reconnect(client, new Error('this side closed - finished'))
  })

  socket.on('error', reconnect.bind(undefined, client))
}

function reconnect (client, err) {
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

    this.url = url

    // state machine, might need more states
    this.closed = false

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
      if (this.closed) {
        return cb(new Error('The client is closed'))
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

      if (typeof body === 'string' || body instanceof Uint8Array) {
        if (headers.hasOwnProperty('content-length')) {
          // we have already written the content-length header
          this.socket.write('\r\n')
        } else {
          this.socket.write(`content-length: ${Buffer.byteLength(body)}\r\n\r\n`, 'ascii')
        }
        this.socket.write(body)
      } else if (body && typeof body.pipe === 'function') {
        // TODO we should pause the queue while we are piping
        if (headers.hasOwnProperty('content-length')) {
          this.socket.write('\r\n', 'ascii')
          body.pipe(this.socket, { end: false })
          this.socket.uncork()
          eos(body, (err) => {
            if (err) {
              // TODO we might want to wait before previous in-flight
              // requests are finished before destroying
              this.socket.destroy(err)
              // needed because destroy will be delayed
              setImmediate(cb, err, null)
              return
            }

            endRequest()
          })
        } else {
          this.socket.write('transfer-encoding: chunked\r\n', 'ascii')
          var through = syncthrough(addTransferEncoding)
          body.pipe(through)
          through.pipe(this.socket, { end: false })
          this.socket.uncork()
          eos(body, (err) => {
            if (err) {
              // TODO we might want to wait before previous in-flight
              // requests are finished before destroying
              this.socket.destroy(err)
              // needed because destroy will be delayed
              setImmediate(cb, err, null)
              return
            }

            this.socket.cork()
            this.socket.write('\r\n0\r\n', 'ascii')
            endRequest()
          })
        }
        return
      }

      endRequest()
    })

    this.pipelining = opts.pipelining || 1

    this[kQueue].drain = () => {
      this.emit('drain')
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

      if (this.closed && this[kQueue].length() === 0) {
        this.destroy()
      }

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

  close () {
    if (this[kTimer]) {
      this[kTimer].clear()
      this[kTimer] = null
    }
    this.closed = true

    // TODO test this
    if (this[kQueue].length() === 0 && this.socket) {
      this.socket.end()
      this.socket = null
    }
  }

  destroy (err) {
    if (this[kTimer]) {
      this[kTimer].clear()
      this[kTimer] = null
    }
    this.closed = true
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

function addTransferEncoding (chunk) {
  var toWrite = '\r\n' + Buffer.byteLength(chunk).toString(16) + '\r\n'
  this.push(toWrite)
  return chunk
}

module.exports = Client
