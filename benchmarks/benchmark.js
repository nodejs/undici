'use strict'

const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { Writable } = require('node:stream')
const { isMainThread } = require('node:worker_threads')

const { Pool, Client, fetch, Agent, setGlobalDispatcher } = require('..')

const { makeParallelRequests, printResults } = require('./_util')

let nodeFetch
const axios = require('axios')
let superagent
let got

const { promisify } = require('node:util')
const request = promisify(require('request'))

const iterations = (parseInt(process.env.SAMPLES, 10) || 10) + 1
const errorThreshold = parseInt(process.env.ERROR_THRESHOLD, 10) || 3
const connections = parseInt(process.env.CONNECTIONS, 10) || 50
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

/** @type {http.RequestOptions} */
const httpBaseOptions = {
  protocol: 'http:',
  hostname: 'localhost',
  method: 'GET',
  path: '/',
  ...dest
}

/** @type {http.RequestOptions} */
const httpNoKeepAliveOptions = {
  ...httpBaseOptions,
  agent: new http.Agent({
    keepAlive: false,
    maxSockets: connections
  })
}

/** @type {http.RequestOptions} */
const httpKeepAliveOptions = {
  ...httpBaseOptions,
  agent: new http.Agent({
    keepAlive: true,
    maxSockets: connections
  })
}

const axiosAgent = new http.Agent({
  keepAlive: true,
  maxSockets: connections
})

const fetchAgent = new http.Agent({
  keepAlive: true,
  maxSockets: connections
})

const gotAgent = new http.Agent({
  keepAlive: true,
  maxSockets: connections
})

const requestAgent = new http.Agent({
  keepAlive: true,
  maxSockets: connections
})

const superagentAgent = new http.Agent({
  keepAlive: true,
  maxSockets: connections
})

const undiciOptions = {
  path: '/',
  method: 'GET',
  blocking: false,
  reset: false,
  headersTimeout,
  bodyTimeout
}

const Class = connections > 1 ? Pool : Client
const dispatcher = new Class(httpBaseOptions.url, {
  pipelining,
  connections,
  ...dest
})

setGlobalDispatcher(new Agent({
  pipelining,
  connections,
  connect: {
    rejectUnauthorized: false
  }
}))

class SimpleRequest {
  constructor (resolve) {
    this.dst = new Writable({
      write (chunk, encoding, callback) {
        callback()
      }
    }).on('finish', resolve)
  }

  onConnect (abort) { }

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

const experiments = {
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
        .pipeline(undiciOptions, ({ body }) => {
          return body
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
}

if (process.env.PORT) {
  // fetch does not support the socket
  experiments['undici - fetch'] = () => {
    return makeParallelRequests(resolve => {
      fetch(dest.url).then(res => {
        res.body.pipeTo(new WritableStream({ write () { }, close () { resolve() } }))
      }).catch(console.log)
    })
  }

  experiments['node-fetch'] = () => {
    return makeParallelRequests(resolve => {
      nodeFetch(dest.url, { agent: fetchAgent }).then(res => {
        res.body.pipe(new Writable({
          write (chunk, encoding, callback) {
            callback()
          }
        })).on('finish', resolve)
      }).catch(console.log)
    })
  }

  const axiosOptions = {
    url: dest.url,
    method: 'GET',
    responseType: 'stream',
    httpAgent: axiosAgent
  }
  experiments.axios = () => {
    return makeParallelRequests(resolve => {
      axios.request(axiosOptions).then(res => {
        res.data.pipe(new Writable({
          write (chunk, encoding, callback) {
            callback()
          }
        })).on('finish', resolve)
      }).catch(console.log)
    })
  }

  const gotOptions = {
    url: dest.url,
    method: 'GET',
    agent: {
      http: gotAgent
    },
    // avoid body processing
    isStream: true
  }
  experiments.got = () => {
    return makeParallelRequests(resolve => {
      got(gotOptions).pipe(new Writable({
        write (chunk, encoding, callback) {
          callback()
        }
      })).on('finish', resolve)
    })
  }

  const requestOptions = {
    url: dest.url,
    method: 'GET',
    agent: requestAgent,
    // avoid body toString
    encoding: null
  }
  experiments.request = () => {
    return makeParallelRequests(resolve => {
      request(requestOptions).then(() => {
        // already body consumed
        resolve()
      }).catch(console.log)
    })
  }

  experiments.superagent = () => {
    return makeParallelRequests(resolve => {
      superagent.get(dest.url).pipe(new Writable({
        write (chunk, encoding, callback) {
          callback()
        }
      })).on('finish', resolve)
    })
  }
}

async function main () {
  const { cronometro } = await import('cronometro')
  const _nodeFetch = await import('node-fetch')
  nodeFetch = _nodeFetch.default
  const _got = await import('got')
  got = _got.default
  const _superagent = await import('superagent')
  // https://github.com/ladjs/superagent/issues/1540#issue-561464561
  superagent = _superagent.agent().use((req) => req.agent(superagentAgent))

  cronometro(
    experiments,
    {
      iterations,
      errorThreshold,
      print: false
    },
    (err, results) => {
      if (err) {
        throw err
      }

      printResults(results)
      dispatcher.destroy()
    }
  )
}

if (isMainThread) {
  main()
} else {
  module.exports = main
}
