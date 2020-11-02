'use strict'
const { Writable } = require('stream')
const http = require('http')
const Benchmark = require('benchmark')
const { Client, Pool } = require('..')
const os = require('os')
const path = require('path')

// # Start the Node.js server
// node benchmarks/server.js
//
// # Start the benchmarks
// node benchmarks/index.js

const connections = parseInt(process.env.CONNECTIONS, 10) || 50
const parallelRequests = parseInt(process.env.PARALLEL, 10) || 10
const pipelining = parseInt(process.env.PIPELINING, 10) || 10
const dest = {}

if (process.env.PORT) {
  dest.port = process.env.PORT
  dest.url = `http://localhost:${process.env.PORT}`
} else {
  dest.url = 'http://localhost'
  dest.socketPath = path.join(os.tmpdir(), 'undici.sock')
}

const httpNoAgent = {
  protocol: 'http:',
  hostname: 'localhost',
  method: 'GET',
  path: '/',
  ...dest
}

const httpOptions = {
  ...httpNoAgent,
  agent: new http.Agent({
    keepAlive: true,
    maxSockets: 1
  })
}

const httpOptionsMultiSocket = {
  ...httpNoAgent,
  agent: new http.Agent({
    keepAlive: true,
    maxSockets: connections
  })
}

const undiciOptions = {
  path: '/',
  method: 'GET',
  headersTimeout: 0,
  bodyTimeout: 0
}

const client = new Client(httpOptions.url, {
  pipelining,
  ...dest
})

const pool = new Pool(httpOptions.url, {
  pipelining,
  connections,
  ...dest
})

const suite = new Benchmark.Suite()

// Benchmark.options.minSamples = 200

suite
  .add('http - no agent ', {
    defer: true,
    fn: deferred => {
      Promise.all(Array.from(Array(parallelRequests)).map(() => new Promise((resolve) => {
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
  .add('http - keepalive', {
    defer: true,
    fn: deferred => {
      Promise.all(Array.from(Array(parallelRequests)).map(() => new Promise((resolve) => {
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
  .add('http - keepalive - multiple sockets', {
    defer: true,
    fn: deferred => {
      Promise.all(Array.from(Array(parallelRequests)).map(() => new Promise((resolve) => {
        http.get(httpOptionsMultiSocket, (res) => {
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
      Promise.all(Array.from(Array(parallelRequests)).map(() => new Promise((resolve) => {
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
      Promise.all(Array.from(Array(parallelRequests)).map(() => new Promise((resolve) => {
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
  .add('undici - pool - request - multiple sockets', {
    defer: true,
    fn: deferred => {
      Promise.all(Array.from(Array(parallelRequests)).map(() => new Promise((resolve) => {
        pool
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
      Promise.all(Array.from(Array(parallelRequests)).map(() => {
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
      Promise.all(Array.from(Array(parallelRequests)).map(() => new Promise((resolve) => {
        client.dispatch(undiciOptions, new SimpleRequest(resolve))
      }))).then(() => deferred.resolve())
    }
  })
  .add('undici - noop', {
    defer: true,
    fn: deferred => {
      Promise.all(Array.from(Array(parallelRequests)).map(() => new Promise((resolve) => {
        client.dispatch(undiciOptions, new NoopRequest(resolve))
      }))).then(() => deferred.resolve())
    }
  })
  .on('cycle', ({ target }) => {
    // Multiply results by parallelRequests to get opts/sec since we do mutiple requests
    // per run.
    target.hz *= parallelRequests
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
