'use strict'
const { Writable } = require('stream')
const http = require('http')
const Benchmark = require('benchmark')
const { Client } = require('..')

// # Start the Node.js server
// node benchmarks/server.js
//
// # Start the benchmarks
// node benchmarks/index.js

const httpOptions = {
  protocol: 'http:',
  hostname: 'localhost',
  method: 'GET',
  path: '/',
  port: 3009,
  agent: new http.Agent({
    keepAlive: true,
    maxSockets: 100
  })
}

const undiciOptions = {
  path: '/',
  method: 'GET',
  requestTimeout: 0
}

const pool = new Client(`http://${httpOptions.hostname}:${httpOptions.port}`)

const suite = new Benchmark.Suite()

Benchmark.options.minSamples = 200

suite
  .add('http - keepalive', {
    defer: true,
    fn: deferred => {
      http.get(httpOptions, (res) => {
        res
          .pipe(new Writable({
            write (chunk, encoding, callback) {
              callback()
            }
          }))
          .on('finish', () => {
            deferred.resolve()
          })
      })
    }
  })
  .add('undici - pipeline', {
    defer: true,
    fn: deferred => {
      pool
        .pipeline(undiciOptions, data => {
          return data.body
        })
        .end()
        .pipe(new Writable({
          write (chunk, encoding, callback) {
            callback()
          }
        }))
        .on('finish', () => {
          deferred.resolve()
        })
    }
  })
  .add('undici - request', {
    defer: true,
    fn: deferred => {
      pool.request(undiciOptions, (err, { body }) => {
        if (err) {
          throw err
        }

        body
          .pipe(new Writable({
            write (chunk, encoding, callback) {
              callback()
            }
          }))
          .on('finish', () => {
            deferred.resolve()
          })
      })
    }
  })
  .add('undici - stream', {
    defer: true,
    fn: deferred => {
      pool.stream(undiciOptions, () => {
        return new Writable({
          write (chunk, encoding, callback) {
            callback()
          }
        })
          .on('finish', () => {
            deferred.resolve()
          })
      }, (err) => {
        if (err) {
          throw err
        }
      })
    }
  })
  .add('undici - dispatch', {
    defer: true,
    fn: deferred => {
      pool.dispatch(undiciOptions, new SimpleRequest(deferred))
    }
  })
  .add('undici - noop', {
    defer: true,
    fn: deferred => {
      pool.dispatch(undiciOptions, new NoopRequest(deferred))
    }
  })
  .on('cycle', event => {
    console.log(String(event.target))
  })
  .run()

class NoopRequest {
  constructor (deferred) {
    this.deferred = deferred
  }

  onConnect (abort) {

  }

  onHeaders (statusCode, headers, resume) {

  }

  onData (chunk) {
    return true
  }

  onComplete (trailers) {
    this.deferred.resolve()
  }

  onError (err) {
    throw err
  }
}

class SimpleRequest {
  constructor (deferred) {
    this.dst = new Writable({
      write (chunk, encoding, callback) {
        callback()
      }
    }).on('finish', () => {
      deferred.resolve()
    })
  }

  onConnect (abort) {
  }

  onHeaders (statusCode, headers, resume) {
    this.dst.on('drain', resume)
  }

  onData (chunk) {
    return this.dst.write(chunk)
  }

  onComplete () {
    this.dst.end()
  }

  onError (err) {
    throw err
  }
}
