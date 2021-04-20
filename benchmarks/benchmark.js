'use strict'

const cronometro = require('cronometro')
const { Writable } = require('stream')
const http = require('http')
const os = require('os')
const path = require('path')

const { Pool, Client } = require('..')

const iterations = parseInt(process.env.SAMPLES, 10) || 100
const errorThreshold = parseInt(process.env.ERROR_TRESHOLD, 10) || 3
const connections = parseInt(process.env.CONNECTIONS, 10) || 50
const pipelining = parseInt(process.env.PIPELINING, 10) || 10
const parallelRequests = parseInt(process.env.PARALLEL, 10) || (connections * pipelining) * 2
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
    maxSockets: connections
  })
}

const httpKeepAliveOptions = {
  ...httpBaseOptions,
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

const Class = connections > 1 ? Pool : Client
const dispatcher = new Class(httpBaseOptions.url, {
  pipelining,
  connections,
  ...dest
})

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
        dispatcher
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
        dispatcher.request(undiciOptions).then(({ body }) => {
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
        return dispatcher
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
        dispatcher.dispatch(undiciOptions, new SimpleRequest(resolve))
      })
    }
  },
  {
    iterations,
    errorThreshold,
    print: {
      colors: false,
      compare: true
    }
  },
  err => {
    if (err) {
      throw err
    }

    dispatcher.destroy()
  }
)
