'use strict'
const { Writable } = require('stream')
const http = require('http')
const Benchmark = require('benchmark')
const undici = require('..')
const { kEnqueue, kGetNext } = require('../lib/symbols')
const Request = require('../lib/request')

// # Start the h2o server (in h2o repository)
// # Then change the port below to 8080
// h2o -c examples/h2o/h2o.conf
//
// # Alternatively start the Node.js server
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
  method: 'GET'
}

const pool = undici(`http://${httpOptions.hostname}:${httpOptions.port}`, {
  connections: 100,
  pipelining: 10,
  requestTimeout: 0
})

const suite = new Benchmark.Suite()

suite
  .add('http - keepalive', {
    defer: true,
    fn: deferred => {
      http.get(httpOptions, response => {
        const stream = new Writable({
          write (chunk, encoding, callback) {
            callback()
          }
        })
        stream.once('finish', () => {
          deferred.resolve()
        })

        response.pipe(stream)
      })
    }
  })
  .add('http - noop', {
    defer: true,
    fn: deferred => {
      http.get(httpOptions, response => {
        response
          .resume()
          .on('end', () => {
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
        .once('finish', () => {
          deferred.resolve()
        })
    }
  })
  .add('undici - request', {
    defer: true,
    fn: deferred => {
      pool.request(undiciOptions, (error, { body }) => {
        if (error) {
          throw error
        }

        const stream = new Writable({
          write (chunk, encoding, callback) {
            callback()
          }
        })
        stream.once('finish', () => {
          deferred.resolve()
        })

        body.pipe(stream)
      })
    }
  })
  .add('undici - stream', {
    defer: true,
    fn: deferred => {
      pool.stream(undiciOptions, () => {
        const stream = new Writable({
          write (chunk, encoding, callback) {
            callback()
          }
        })
        stream.once('finish', () => {
          deferred.resolve()
        })

        return stream
      }, error => {
        if (error) {
          throw error
        }
      })
    }
  })
  .add('undici - simple', {
    defer: true,
    fn: deferred => {
      const stream = new Writable({
        write (chunk, encoding, callback) {
          callback()
        }
      })
      stream.once('finish', () => {
        deferred.resolve()
      })
      pool[kGetNext]()[kEnqueue](new SimpleRequest(undiciOptions, stream))
    }
  })
  .add('undici - noop', {
    defer: true,
    fn: deferred => {
      pool[kGetNext]()[kEnqueue](new NoopRequest(undiciOptions, deferred))
    }
  })
  .on('cycle', event => {
    console.log(String(event.target))
  })
  .run()

class NoopRequest extends Request {
  constructor (opts, deferred) {
    super(opts)
    this.deferred = deferred
  }

  onHeaders () {}

  onBody () {}

  onComplete () {
    this.deferred.resolve()
  }
}

class SimpleRequest extends Request {
  constructor (opts, dst) {
    super(opts)
    this.dst = dst
    this.dst.on('drain', () => {
      this.resume()
    })
  }

  onHeaders (statusCode, headers, resume) {
    this.resume = resume
  }

  onBody (chunk, offset, length) {
    return this.dst.write(chunk.slice(offset, offset + length))
  }

  onComplete () {
    this.dst.end()
  }
}
