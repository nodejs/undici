'use strict'

const { URL } = require('url')
const net = require('net')
const Q = require('fastq')
const { HTTPParser } = require('http-parser-js')
const { Readable } = require('readable-stream')
const eos = require('end-of-stream')
const syncthrough = require('syncthrough')

class Undici {
  constructor (url) {
    if (!(url instanceof URL)) {
      url = new URL(url)
    }

    // TODO support TSL
    this.socket = net.connect(url.port, url.hostname)

    this.parser = new HTTPParser(HTTPParser.RESPONSE)

    const endRequest = () => {
      this.socket.write('\r\n', 'ascii')
      this.socket.uncork()
      this._needHeaders = true
      read()
    }

    // TODO support http pipelining
    this.q = Q((request, cb) => {
      var { method, path, body, headers } = request
      var req = `${method} ${path} HTTP/1.1\r\nHost: ${url.hostname}\r\nConnection: keep-alive\r\n`

      this._lastCb = cb
      this.socket.cork()

      if (headers) {
        const headerNames = Object.keys(headers)
        for (var i = 0; i < headerNames.length; i++) {
          var name = headerNames[i]
          req += name + ': ' + headers[name] + '\r\n'
        }
      }
      this.socket.write(req, 'ascii')

      if (typeof body === 'string' || body instanceof Uint8Array) {
        this.socket.write(`content-length: ${Buffer.byteLength(body)}\r\n\r\n`, 'ascii')
        this.socket.write(body)
      } else if (body && typeof body.pipe === 'function') {
        if (headers && headers['content-length']) {
          this.socket.write('\r\n', 'ascii')
          body.pipe(this.socket, { end: false })
          this.socket.uncork()
          eos(body, () => {
            // TODO handle err
            endRequest()
          })
        } else {
          this.socket.write('transfer-encoding: chunked\r\n', 'ascii')
          var through = syncthrough(addTransferEncoding)
          body.pipe(through)
          through.pipe(this.socket, { end: false })
          this.socket.uncork()
          eos(body, () => {
            // TODO handle err
            this.socket.cork()
            this.socket.write('\r\n0\r\n', 'ascii')
            endRequest()
          })
        }
        return
      }

      endRequest()
    }, 1)

    this.q.pause()

    this._needHeaders = false
    this._lastBody = null

    this.socket.on('connect', () => {
      this.q.resume()
    })

    this.parser[HTTPParser.kOnHeaders] = () => {}
    this.parser[HTTPParser.kOnHeadersComplete] = ({ statusCode, headers }) => {
      const cb = this._lastCb
      this._needHeaders = false
      this._lastBody = new Readable({ read })
      this._lastCb = null
      cb(null, {
        statusCode,
        headers: parseHeaders(headers),
        body: this._lastBody
      })
    }

    this.parser[HTTPParser.kOnBody] = (chunk, offset, length) => {
      this._lastBody.push(chunk.slice(offset, offset + length))
    }

    this.parser[HTTPParser.kOnMessageComplete] = () => {
      const body = this._lastBody
      this._lastBody = null
      body.push(null)
    }

    const read = () => {
      if (!this.socket) {
        // TODO this should not happen
        return
      }

      var chunk = null
      var hasRead = false
      while ((chunk = this.socket.read()) !== null) {
        hasRead = true
        this.parser.execute(chunk)
      }

      if (!hasRead || this._needHeaders) {
        this.socket.once('readable', read)
      }
    }
  }

  call (opts, cb) {
    // TODO validate body type
    // TODO validate that the body is a string, buffer or stream
    this.q.push(opts, cb)
  }

  close () {
    if (this.socket) {
      // TODO make sure we error everything that
      // is in flight
      this.q.kill()
      this.socket.end()
      this.socket = null
    }
  }
}

function parseHeaders (headers) {
  const obj = {}
  for (var i = 0; i < headers.length; i += 2) {
    var key = headers[i]
    if (!obj[key]) {
      obj[key] = headers[i + 1]
    } else {
      obj[key].push(headers[i + 1])
    }
  }
  return obj
}

function addTransferEncoding (chunk) {
  var toWrite = '\r\n' + Buffer.byteLength(chunk).toString(16) + '\r\n'
  this.push(toWrite)
  return chunk
}

module.exports = Undici
