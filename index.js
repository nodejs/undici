'use strict'

const { URL } = require('url')
const net = require('net')
const Q = require('fastq')
const { HTTPParser } = require('http-parser-js')
const { Readable } = require('readable-stream')

class Undici {
  constructor (url) {
    if (!(url instanceof URL)) {
      url = new URL(url)
    }

    // TODO support TSL
    this.socket = net.connect(url.port, url.hostname)

    this.parser = new HTTPParser(HTTPParser.RESPONSE)

    // TODO support http pipelining
    this.q = Q((request, cb) => {
      var { method, path, body } = request
      var req = `${method} ${path} HTTP/1.1\r\nHost: ${url.hostname}\r\nConnection: keep-alive\r\n`

      this.socket.cork()
      this.socket.write(req, 'ascii')

      if (typeof body === 'string') {
        // TODO move this to a headers block
        this.socket.write('content-length: ' + Buffer.byteLength(body) + '\r\n', 'ascii')
        this.socket.write('\r\n', 'ascii')
        this.socket.write(body, 'utf8')
      }

      this.socket.write('\r\n', 'ascii')
      this.socket.uncork()

      this._lastBody = new Readable({ read })
      this._lastCb = cb
      read()
    }, 1)

    this.q.pause()

    this._lastHeaders = null
    this._lastBody = null

    this.socket.on('connect', () => {
      this.q.resume()
    })

    this.parser[HTTPParser.kOnHeaders] = () => {}
    this.parser[HTTPParser.kOnHeadersComplete] = (headers) => {
      this._lastHeaders = headers
      this._lastCb(null, { headers, body: this._lastBody })
    }

    this.parser[HTTPParser.kOnBody] = (chunk, offset, length) => {
      this._lastBody.push(chunk.slice(offset, offset + length))
    }

    this.parser[HTTPParser.kOnMessageComplete] = () => {
      this._lastBody.push(null)
      this._lastBody = null
      this._lastHeaders = null
    }

    const read = () => {
      var chunk = null
      var hasRead = false
      while ((chunk = this.socket.read()) !== null) {
        hasRead = true
        this.parser.execute(chunk)
      }

      if (!hasRead) {
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

module.exports = Undici
