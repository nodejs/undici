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
  socketPath: '/var/tmp/undici.sock',
  method: 'GET',
  path: '/',
  agent: new http.Agent({
    keepAlive: true,
    maxSockets: 1
  })
}

const undiciOptions = {
  path: '/',
  method: 'GET',
  requestTimeout: 0
}

const client = new Client(`http://${httpOptions.hostname}`, {
  pipelining: 10,
  socketPath: '/var/tmp/undici.sock'
})

client.on('disconnect', (err) => {
  throw err
})

const suite = new Benchmark.Suite()

Benchmark.options.minSamples = 200

suite
  .add('http - keepalive', {
    defer: true,
    fn: deferred => {
      Promise.all(Array.from(Array(10)).map(() => new Promise((resolve) => {
        http.get(httpOptions, (res) => {
          res
            .pipe(new Writable({
              write (chunk, encoding, callback) {
                callback()
              }
            }))
            .on('finish', resolve)
        })
      }))).then(() => deferred.resolve())
    }
  })
  .add('undici - pipeline', {
    defer: true,
    fn: deferred => {
      Promise.all(Array.from(Array(10)).map(() => new Promise((resolve) => {
        client
          .pipeline(undiciOptions, data => {
            return data.body
          })
          .end()
          .pipe(new Writable({
            write (chunk, encoding, callback) {
              callback()
            }
          }))
          .on('finish', resolve)
      }))).then(() => deferred.resolve())
    }
  })
  .add('undici - request', {
    defer: true,
    fn: deferred => {
      Promise.all(Array.from(Array(10)).map(() => new Promise((resolve) => {
        client
          .request(undiciOptions)
          .then(({ body }) => {
            body
              .pipe(new Writable({
                write (chunk, encoding, callback) {
                  callback()
                }
              }))
              .on('finish', resolve)
          })
      }))).then(() => deferred.resolve())
    }
  })
  .add('undici - stream', {
    defer: true,
    fn: deferred => {
      Promise.all(Array.from(Array(10)).map(() => {
        return client.stream(undiciOptions, () => {
          return new Writable({
            write (chunk, encoding, callback) {
              callback()
            }
          })
        })
      })).then(() => deferred.resolve())
    }
  })
  .add('undici - dispatch', {
    defer: true,
    fn: deferred => {
      Promise.all(Array.from(Array(10)).map(() => new Promise((resolve) => {
        client.dispatch(undiciOptions, new SimpleRequest(resolve))
      }))).then(() => deferred.resolve())
    }
  })
  .add('undici - noop', {
    defer: true,
    fn: deferred => {
      Promise.all(Array.from(Array(10)).map(() => new Promise((resolve) => {
        client.dispatch(undiciOptions, new NoopRequest(resolve))
      }))).then(() => deferred.resolve())
    }
  })
  .on('cycle', ({ target }) => {
    // Multiply results by 10x to get opts/sec since we do 10 requests
    // per run.
    target.hz *= 10
    console.log(String(target))
  })
  .on('complete', () => {
    client.destroy()
  })
  .run()

class NoopRequest {
  constructor (resolve) {
    this.resolve = resolve
  }

  onConnect (abort) {

  }

  onHeaders (statusCode, headers, resume) {

  }

  onData (chunk) {
    return true
  }

  onComplete (trailers) {
    this.resolve()
  }

  onError (err) {
    throw err
  }
}

class SimpleRequest {
  constructor (resolve) {
    this.dst = new Writable({
      write (chunk, encoding, callback) {
        callback()
      }
    }).on('finish', resolve)
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
