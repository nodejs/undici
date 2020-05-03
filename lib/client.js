'use strict'

/* eslint no-prototype-builtins: "off" */

const { URL } = require('url')
const net = require('net')
const tls = require('tls')
const Q = require('fastq')
const { HTTPParser } = require('http-parser-js')
const retimer = require('retimer')
const { EventEmitter } = require('events')
const Request = require('./request')
const assert = require('assert')

const kRead = Symbol('read')
const kReadCb = Symbol('readCallback')
const kIsWaiting = Symbol('isWaiting')
const kQueue = Symbol('queue')
const kInflight = Symbol('inflight')
const kTimer = Symbol('timer')
const kTLSOpts = Symbol('TLS Options')
const kLastBody = Symbol('lastBody')
const kNeedHeaders = Symbol('needHeaders')
const kResetParser = Symbol('resetParser')
const kStream = Symbol('kStream')

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

  client[kResetParser]()

  // stop the queue and reset the parsing state
  client[kQueue].pause()
  client[kIsWaiting] = false
  client[kNeedHeaders] = 0
  client[kLastBody] = null

  socket.on('connect', () => {
    client.emit('connect')
    client[kQueue].resume()
  })

  client[kStream].finished(socket, (err) => {
    reconnect(client, err)
  })
}

function reconnect (client, err) {
  err = err || new Error('other side closed')

  if (client[kLastBody]) {
    client[kLastBody].destroy(err)
    client[kLastBody] = null
  }

  if (client.destroyed) {
    // reset callbacks
    const inflight = client[kInflight].splice(0)
    for (const { callback } of inflight) {
      callback(err, null)
    }
    // flush queue
    // TODO: Forward err?
    client[kQueue].resume()
    return
  }

  client[kResetParser]()

  // reset events
  client.socket.removeAllListeners('end')
  client.socket.removeAllListeners('finish')
  client.socket.removeAllListeners('error')
  client.socket.on('error', () => {})
  client.socket = null

  // we reset the callbacks
  const inflight = client[kInflight].splice(0)

  if (client[kQueue].length() > 0) {
    connect(client)
  }

  for (const { callback } of inflight) {
    callback(err, null)
  }

  client.emit('reconnect')
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

    this[kStream] = opts.stream || require('readable-stream')

    // state machine, might need more states
    this.closed = false
    this.destroyed = false

    this[kTLSOpts] = opts.tls || opts.https

    const endRequest = () => {
      this.socket.write('\r\n', 'ascii')
      this.socket.uncork()
      this[kNeedHeaders]++
      this[kRead]()
    }

    this.timeout = opts.timeout || 30000 // 30 seconds
    this[kInflight] = []

    const timerCb = () => {
      if (this[kInflight].length > 0) {
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

      this[kInflight].push({
        request,
        // wrap the callback in a AsyncResource
        callback: request.wrap(cb)
      })

      const { method, path, body } = request
      const headers = request.headers || {}
      this.socket.cork()
      this.socket.write(`${method} ${path} HTTP/1.1\r\nConnection: keep-alive\r\n`, 'ascii')

      if (!(headers.host || headers.Host)) {
        this.socket.write('Host: ' + url.hostname + '\r\n', 'ascii')
      }
      const headerNames = Object.keys(headers)
      for (let i = 0; i < headerNames.length; i++) {
        const name = headerNames[i]
        this.socket.write(name + ': ' + headers[name] + '\r\n', 'ascii')
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
        const cleanup = this[kStream].finished(this.socket, (err) => {
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
        this[kStream].finished(body, (err) => {
          cleanup()
          if (err || !this.socket) {
            // TODO we might want to wait before previous in-flight
            // requests are finished before destroying
            if (this.socket) {
              destroySocket(this, err, cb)
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

    this[kResetParser] = () => {
      this.parser = new HTTPParser(HTTPParser.RESPONSE)
      this.parser[HTTPParser.kOnHeaders] = () => {}
      this.parser[HTTPParser.kOnHeadersComplete] = ({ statusCode, headers }) => {
        // TODO move this[kInflight] from being an array. The array allocation
        // is showing up in the flamegraph.
        const { request, callback } = this[kInflight].shift()
        const skipBody = request.method === 'HEAD'

        if (!skipBody) {
          this[kLastBody] = new this[kStream].Readable({ read: this[kRead] })
          this[kLastBody].push = request.wrapSimple(this[kLastBody], this[kLastBody].push)
        }
        callback(null, {
          statusCode,
          headers: parseHeaders(headers),
          body: this[kLastBody]
        })
        destroyMaybe(this)
        return skipBody
      }

      this.parser[HTTPParser.kOnBody] = (chunk, offset, length) => {
        this[kLastBody].push(chunk.slice(offset, offset + length))
      }

      this.parser[HTTPParser.kOnMessageComplete] = () => {
        const body = this[kLastBody]
        this[kLastBody] = null
        if (body !== null) {
          body.push(null)
        }
        destroyMaybe(this)
      }
    }
    this[kResetParser]()

    this[kRead] = () => {
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

      if (!this[kIsWaiting] && (!hasRead || this[kNeedHeaders] > 0)) {
        this[kIsWaiting] = true
        socket.once('readable', this[kReadCb])
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
    if (cb === undefined) {
      return new Promise((resolve, reject) => {
        this.close((err, data) => {
          return err ? reject(err) : resolve(data)
        })
      })
    }

    this.closed = true

    destroyMaybe(this)

    if (!cb) {
      return
    }

    if (this.socket) {
      this[kStream].finished(this.socket, (err) => {
        if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
          cb(err)
        } else {
          cb(null)
        }
      })
    } else {
      assert(this.destroyed)
      process.nextTick(cb, null)
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
    !client[kLastBody] &&
    client[kQueue].length() === 0 &&
    client[kInflight].length === 0
  ) {
    client.destroy()
  }
}

function destroySocket (client, err, cb) {
  // This code is basically the same as...
  // stream.finished(socket, er => cb(err || er))
  // socket.destroy(err)
  // ... in Node 14+
  const socket = client.socket
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
    client[kStream].finished(socket, callback)
  } else {
    socket.on('error', callback)
    setImmediate(callback)
  }
  socket.destroy(err)
}
