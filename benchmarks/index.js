'use strict'

const cronometro = require('cronometro')
const { Writable } = require('stream')
const http = require('http')
const os = require('os')
const path = require('path')

const { Client, Pool } = require('..')

// # Start the Node.js server
// node benchmarks/server.js
//
// # Start the benchmarks
// node benchmarks/index.js

// Parse and normalize parameters
const samples = parseInt(process.env.SAMPLES, 10) || 100
const connections = parseInt(process.env.CONNECTIONS, 10) || 50
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
  headersTimeout,
  bodyTimeout
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

function makeParallelsRequests (cb) {
  return Promise.all(Array.from(Array(parallelRequests)).map(() => new Promise(cb)))
}

cronometro(
  {
    'http - no agent' () {
      return makeParallelsRequests(resolve => {
        http.get(httpNoAgent, res => {
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
      return makeParallelsRequests(resolve => {
        http.get(httpOptions, res => {
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
    'http - keepalive - multiple sockets' () {
      return makeParallelsRequests(resolve => {
        http.get(httpOptionsMultiSocket, res => {
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
      return makeParallelsRequests(resolve => {
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
      return makeParallelsRequests(resolve => {
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
    'undici - pool - request - multiple sockets' () {
      return makeParallelsRequests(resolve => {
        pool.request(undiciOptions).then(({ body }) => {
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
      return makeParallelsRequests(resolve => {
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
      return makeParallelsRequests(resolve => {
        client.dispatch(undiciOptions, new SimpleRequest(resolve))
      })
    },
    'undici - noop' () {
      return makeParallelsRequests(resolve => {
        client.dispatch(undiciOptions, new NoopRequest(resolve))
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
  (err) => {
    if (err) {
      throw err
    }

    client.destroy()
  }
)
