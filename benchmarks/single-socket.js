'use strict'

const cronometro = require('cronometro')
const { Writable } = require('stream')
const http = require('http')
const os = require('os')
const path = require('path')

const { Client } = require('..')

// # Start the Node.js server
// node benchmarks/server.js
//
// # Start the benchmarks
// node benchmarks/index.js

// Parse and normalize parameters
const samples = parseInt(process.env.SAMPLES, 10) || 100
const parallelRequests = parseInt(process.env.PARALLEL, 10) || 10
const pipelining = parseInt(process.env.PIPELINING, 10) || 10
const headersTimeout = parseInt(process.env.HEADERS_TIMEOUT, 10) || 0
const bodyTimeout = parseInt(process.env.BODY_TIMEOUT, 10) || 0
const dest = {}

if (process.env.PORT) {
  dest.port = process.env.PORT
  dest.url = `http://localhost:${process.env.PORT}`
} else {
  dest.url = 'http://localhost'
  dest.socketPath = path.join(os.tmpdir(), 'undici.sock')
}

const httpBaseOptions = {
  protocol: 'http:',
  hostname: 'localhost',
  method: 'GET',
  path: '/',
  ...dest
}

const httpNoKeepAliveOptions = {
  ...httpBaseOptions,
  agent: new http.Agent({
    keepAlive: false,
    maxSockets: 1
  })
}

const httpKeepAliveOptions = {
  ...httpBaseOptions,
  agent: new http.Agent({
    keepAlive: true,
    maxSockets: 1
  })
}

const undiciOptions = {
  path: '/',
  method: 'GET',
  headersTimeout,
  bodyTimeout
}

const client = new Client(httpBaseOptions.url, {
  pipelining,
  ...dest
})

class NoopRequest {
  constructor (resolve) {
    this.resolve = resolve
  }

  onConnect (abort) {}

  onHeaders (statusCode, headers, resume) {}

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

  onConnect (abort) {}

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

function makeParallelRequests (cb) {
  return Promise.all(Array.from(Array(parallelRequests)).map(() => new Promise(cb)))
}

cronometro(
  {
    'http - no keepalive' () {
      return makeParallelRequests(resolve => {
        http.get(httpNoKeepAliveOptions, res => {
          res
            .pipe(
              new Writable({
                write (chunk, encoding, callback) {
                  callback()
                }
              })
            )
            .on('finish', resolve)
        })
      })
    },
    'http - keepalive' () {
      return makeParallelRequests(resolve => {
        http.get(httpKeepAliveOptions, res => {
          res
            .pipe(
              new Writable({
                write (chunk, encoding, callback) {
                  callback()
                }
              })
            )
            .on('finish', resolve)
        })
      })
    },
    'undici - pipeline' () {
      return makeParallelRequests(resolve => {
        client
          .pipeline(undiciOptions, data => {
            return data.body
          })
          .end()
          .pipe(
            new Writable({
              write (chunk, encoding, callback) {
                callback()
              }
            })
          )
          .on('finish', resolve)
      })
    },
    'undici - request' () {
      return makeParallelRequests(resolve => {
        client.request(undiciOptions).then(({ body }) => {
          body
            .pipe(
              new Writable({
                write (chunk, encoding, callback) {
                  callback()
                }
              })
            )
            .on('finish', resolve)
        })
      })
    },
    'undici - stream' () {
      return makeParallelRequests(resolve => {
        return client
          .stream(undiciOptions, () => {
            return new Writable({
              write (chunk, encoding, callback) {
                callback()
              }
            })
          })
          .then(resolve)
      })
    },
    'undici - dispatch' () {
      return makeParallelRequests(resolve => {
        client.dispatch(undiciOptions, new SimpleRequest(resolve))
      })
    }
  },
  {
    iterations: samples,
    print: {
      colors: false,
      compare: true
    }
  },
  err => {
    if (err) {
      throw err
    }

    client.destroy()
  }
)
