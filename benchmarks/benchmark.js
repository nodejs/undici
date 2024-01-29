'use strict'

const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { Writable } = require('node:stream')
const { isMainThread } = require('node:worker_threads')

const { Pool, Client, fetch, Agent, setGlobalDispatcher } = require('..')

let nodeFetch
const axios = require('axios')
let got

const util = require('node:util')
const _request = require('request')
const request = util.promisify(_request)

const iterations = (parseInt(process.env.SAMPLES, 10) || 10) + 1
const errorThreshold = parseInt(process.env.ERROR_THRESHOLD, 10) || 3
const connections = parseInt(process.env.CONNECTIONS, 10) || 50
const pipelining = parseInt(process.env.PIPELINING, 10) || 10
const parallelRequests = parseInt(process.env.PARALLEL, 10) || 100
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
  query: {
    frappucino: 'muffin',
    goat: 'scone',
    pond: 'moose',
    foo: ['bar', 'baz', 'bal'],
    bool: true,
    numberKey: 256
  },
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

function makeParallelRequests (cb) {
  return Promise.all(Array.from(Array(parallelRequests)).map(() => new Promise(cb)))
}

function printResults (results) {
  // Sort results by least performant first, then compare relative performances and also printing padding
  let last

  const rows = Object.entries(results)
    // If any failed, put on the top of the list, otherwise order by mean, ascending
    .sort((a, b) => (!a[1].success ? -1 : b[1].mean - a[1].mean))
    .map(([name, result]) => {
      if (!result.success) {
        return {
          Tests: name,
          Samples: result.size,
          Result: 'Errored',
          Tolerance: 'N/A',
          'Difference with Slowest': 'N/A'
        }
      }

      // Calculate throughput and relative performance
      const { size, mean, standardError } = result
      const relative = last !== 0 ? (last / mean - 1) * 100 : 0

      // Save the slowest for relative comparison
      if (typeof last === 'undefined') {
        last = mean
      }

      return {
        Tests: name,
        Samples: size,
        Result: `${((connections * 1e9) / mean).toFixed(2)} req/sec`,
        Tolerance: `± ${((standardError / mean) * 100).toFixed(2)} %`,
        'Difference with slowest': relative > 0 ? `+ ${relative.toFixed(2)} %` : '-'
      }
    })

  return console.table(rows)
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

  experiments.axios = () => {
    return makeParallelRequests(resolve => {
      axios.get(dest.url, { responseType: 'stream', httpAgent: axiosAgent }).then(res => {
        res.data.pipe(new Writable({
          write (chunk, encoding, callback) {
            callback()
          }
        })).on('finish', resolve)
      }).catch(console.log)
    })
  }

  experiments.got = () => {
    return makeParallelRequests(resolve => {
      got.get(dest.url, null, { http: gotAgent }).then(res => {
        res.pipe(new Writable({
          write (chunk, encoding, callback) {
            callback()
          }
        })).on('finish', resolve)
      }).catch(console.log)
    })
  }

  experiments.request = () => {
    return makeParallelRequests(resolve => {
      request(dest.url, { agent: requestAgent }).then(res => {
        res.pipe(new Writable({
          write (chunk, encoding, callback) {
            callback()
          }
        })).on('finish', resolve)
      }).catch(console.log)
    })
  }
}

async function main () {
  const { cronometro } = await import('cronometro')
  const _nodeFetch = await import('node-fetch')
  nodeFetch = _nodeFetch.default
  const _got = await import('got')
  got = _got.default

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
