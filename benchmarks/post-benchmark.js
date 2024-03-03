'use strict'

const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { Writable } = require('node:stream')
const { isMainThread } = require('node:worker_threads')

const { Pool, Client, fetch, Agent, setGlobalDispatcher } = require('..')

let nodeFetch
const axios = require('axios')
let superagent
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

const data = '_'.repeat(128 * 1024)
const dataLength = `${Buffer.byteLength(data)}`

if (process.env.PORT) {
  dest.port = process.env.PORT
  dest.url = `http://localhost:${process.env.PORT}`
} else {
  dest.url = 'http://localhost'
  dest.socketPath = path.join(os.tmpdir(), 'undici.sock')
}

const headers = {
  'Content-Type': 'text/plain; charset=UTF-8',
  'Content-Length': dataLength
}

/** @type {http.RequestOptions} */
const httpBaseOptions = {
  protocol: 'http:',
  hostname: 'localhost',
  method: 'POST',
  path: '/',
  headers,
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

/** @type {import("..").Dispatcher.DispatchOptions} */
const undiciOptions = {
  path: '/',
  method: 'POST',
  headersTimeout,
  bodyTimeout,
  body: data,
  headers
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
  const promises = new Array(parallelRequests)
  for (let i = 0; i < parallelRequests; ++i) {
    promises[i] = new Promise(cb)
  }
  return Promise.all(promises)
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
        Result: `${((parallelRequests * 1e9) / mean).toFixed(2)} req/sec`,
        Tolerance: `± ${((standardError / mean) * 100).toFixed(2)} %`,
        'Difference with slowest': relative > 0 ? `+ ${relative.toFixed(2)} %` : '-'
      }
    })

  return console.table(rows)
}

const experiments = {
  'http - no keepalive' () {
    return makeParallelRequests(resolve => {
      const request = http.request(httpNoKeepAliveOptions, res => {
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
      request.end(data)
    })
  },
  'http - keepalive' () {
    return makeParallelRequests(resolve => {
      const request = http.request(httpKeepAliveOptions, res => {
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
      request.end(data)
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
  /** @type {RequestInit} */
  const fetchOptions = {
    method: 'POST',
    body: data,
    headers
  }
  // fetch does not support the socket
  experiments['undici - fetch'] = () => {
    return makeParallelRequests(resolve => {
      fetch(dest.url, fetchOptions).then(res => {
        res.body.pipeTo(new WritableStream({ write () { }, close () { resolve() } }))
      }).catch(console.log)
    })
  }

  const nodeFetchOptions = {
    ...fetchOptions,
    agent: fetchAgent
  }
  experiments['node-fetch'] = () => {
    return makeParallelRequests(resolve => {
      nodeFetch(dest.url, nodeFetchOptions).then(res => {
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
    method: 'POST',
    headers,
    responseType: 'stream',
    httpAgent: axiosAgent,
    data
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
    method: 'POST',
    headers,
    agent: {
      http: gotAgent
    },
    body: data
  }
  experiments.got = () => {
    return makeParallelRequests(resolve => {
      got(dest.url, gotOptions).then(res => {
        res.pipe(new Writable({
          write (chunk, encoding, callback) {
            callback()
          }
        })).on('finish', resolve)
      }).catch(console.log)
    })
  }

  const requestOptions = {
    url: dest.url,
    method: 'POST',
    headers,
    agent: requestAgent,
    data
  }
  experiments.request = () => {
    return makeParallelRequests(resolve => {
      request(requestOptions).then(res => {
        res.pipe(new Writable({
          write (chunk, encoding, callback) {
            callback()
          }
        })).on('finish', resolve)
      }).catch(console.log)
    })
  }

  experiments.superagent = () => {
    return makeParallelRequests(resolve => {
      superagent
        .post(dest.url)
        .send(data)
        .set('Content-Type', 'text/plain; charset=UTF-8')
        .set('Content-Length', dataLength)
        .pipe(new Writable({
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
