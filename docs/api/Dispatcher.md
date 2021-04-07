# Dispatcher

Extends: `events.EventEmitter`

Dispatcher is the core API used to dispatch requests.

Requests are not guaranteed to be dispatched in order of invocation.

### `Dispatcher.dispatch(options, handler)`

#### Example 1 - Dispatch GET request

```js
'use strict'
const { createServer } = require('http')
const { Client } = require('undici')

const server = createServer((request, response) => {
  response.end('Hello, World!')
})
server.listen(() => {
  const client = new Client(`http://localhost:${server.address().port}`)

  const data = []

  client.dispatch({
    path: '/',
    method: 'GET',
    headers: {
      'x-foo': 'bar'
    }
  }, {
    onConnect: () => {
      console.log('Connected!')
    },
    onError: (error) => {
      console.error(error)
    },
    onHeaders: (statusCode, headers) => {
      console.log(`onHeaders | statusCode: ${statusCode} | headers: ${headers}`)
    },
    onData: (chunk) => {
      console.log('onData : chunk received')
      data.push(chunk)
    },
    onComplete: (trailers) => {
      console.log(`onComplete | trailers: ${trailers}`)
      const res = Buffer.concat(data).toString('utf8')
      console.log(`Data: ${res}`)
      client.close()
      server.close()
    }
  })
})
```

#### Example 2 - Dispatch Upgrade Request

```js
'use strict'
const { createServer } = require('http')
const { Client } = require('undici')

const server = createServer((request, response) => {
  response.end()
})

server.on('upgrade', (request, socket, head) => {
  console.log('Node.js Server - upgrade event')
  socket.write('HTTP/1.1 101 Web Socket Protocol Handshake\r\n')
  socket.write('Upgrade: WebSocket\r\n')
  socket.write('Connection: Upgrade\r\n')
  socket.write('\r\n')
  socket.end()
})

server.listen(() => {
  const client = new Client(`http://localhost:${server.address().port}`)

  client.dispatch({
    path: '/',
    method: 'GET',
    upgrade: 'websocket'
  }, {
    onConnect: () => {
      console.log('Undici Client - onConnect')
    },
    onError: (error) => {
      console.log('onError') // shouldn't print
    },
    onUpgrade: (statusCode, headers, socket) => {
      console.log('Undici Client - onUpgrade')
      console.log(`onUpgrade Headers: ${headers}`)
      socket.on('data', buffer => {
        console.log(buffer.toString('utf8'))
      })
      socket.on('end', () => {
        client.close()
        server.close()
      })
      socket.end()
    }
  })
})
```
### `Dispatcher.connect(options[, callback])`

Starts two-way communications with the requested resource using [HTTP CONNECT](https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods/CONNECT).

Arguments:

* **options** `ConnectOptions`
* **callback** `(err: Error | null, data: ConnectData | null) => void` (optional)

Returns: `void | Promise<ConnectData>` - Only returns a `Promise` if no `callback` argument was passed

#### Parameter: `ConnectOptions`

* **path** `string`
* **headers** `UndiciHeaders` (optional) - Default: `null`
* **signal** `AbortSignal | events.EventEmitter | null` (optional) - Default: `null`
* **opaque** `unknown` (optional) - This argument parameter is passed through to `ConnectData`

#### Parameter: `ConnectData`

* **statusCode** `number`
* **headers** `http.IncomingHttpHeaders`
* **socket** `stream.Duplex`
* **opaque** `unknown`

#### Example - Connect request with echo

```js
'use strict'
const { createServer } = require('http')
const { Client } = require('undici')

const server = createServer((request, response) => {
  throw Error('should never get here')
})

server.on('connect', (req, socket, head) => {
  socket.write('HTTP/1.1 200 Connection established\r\n\r\n')

  let data = head.toString()
  socket.on('data', (buf) => {
    data += buf.toString()
  })

  socket.on('end', () => {
    socket.end(data)
  })
})

server.listen(() => {
  const client = new Client(`http://localhost:${server.address().port}`)

  client
    .connect({ path: '/' })
    .then(({ socket }) => {
      const wanted = 'Body'
      let data = ''
      socket.on('data', d => { data += d })
      socket.on('end', () => {
        console.log(`Data received: ${data.toString()} | Data wanted: ${wanted}`)
        client.close()
        server.close()
      })
      socket.write(wanted)
      socket.end()
    })
})
```

### `Dispatcher.pipeline(options, handler)`

For easy use with [stream.pipeline](https://nodejs.org/api/stream.html#stream_stream_pipeline_source_transforms_destination_callback). The `handler` argument should return a `Readable` from which the result will be read. Usually it should just return the `body` argument unless some kind of transformation needs to be performed based on e.g. `headers` or `statusCode`. The `handler` should validate the response and save any required state. If there is an error, it should be thrown. The function returns a `Duplex` which writes to the request and reads from the response.

Arguments:

* **options** `PipelineOptions`
* **handler** `(data: PipelineHandlerData) => stream.Readable`

Returns: `stream.Duplex`

#### Parameter: PipelineOptions

Extends: [`RequestOptions`](#parameter-requestoptions)

* **objectMode** `boolean` (optional) - Default: `false` - Set to `true` if the `handler` will return an object stream.

#### Parameter: PipelineHandlerData

* **statusCode** `number`
* **headers** `IncomingHttpHeaders`
* **opaque** `unknown`
* **body** `stream.Readable`

#### Example 1 - Pipeline Echo

```js
'use strict'
const { Readable, Writable, PassThrough, pipeline } = require('stream')
const { createServer } = require('http')
const { Client } = require('undici')


const server = createServer((request, response) => {
  request.pipe(response)
})

server.listen(() => {
  const client = new Client(`http://localhost:${server.address().port}`)

  let res = ''

  pipeline(
    new Readable({
      read () {
        this.push(Buffer.from('undici'))
        this.push(null)
      }
    }),
    client.pipeline({
      path: '/',
      method: 'GET'
    }, ({ statusCode, headers, body }) => {
      console.log(`response received ${statusCode}`)
      console.log('headers', headers)
      return pipeline(body, new PassThrough(), () => {})
    }),
    new Writable({
      write (chunk, _, callback) {
        res += chunk.toString()
        callback()
      },
      final (callback) {
        console.log(`Response pipelined to writable: ${res}`)
        callback()
      }
    }),
    error => {
      if (error) {
        console.error(error)
      }

      client.close()
      server.close()
    }
  )
})
```

### `Dispatcher.request(options[, callback])`

Performs a HTTP request.

Non-idempotent requests will not be pipelined in order
to avoid indirect failures.

Idempotent requests will be automatically retried if
they fail due to indirect failure from the request
at the head of the pipeline. This does not apply to
idempotent requests with a stream request body.

Arguments:

* **options** `RequestOptions`
* **callback** `(error: Error | null, data: ResponseData) => void` (optional)

Returns: `void | Promise<ResponseData>` - Only returns a `Promise` if no `callback` argument was passed

#### Parameter: `RequestOptions`

Extends: [`DispatchOptions`](#parameter-dispatchoptions)

* **opaque** `unknown` (optional) - Default: `null` - Used for passing through context to `ResponseData`
* **signal** `AbortSignal | events.EventEmitter | null` (optional) - Default: `null`

The `RequestOptions.method` property should not be value `'CONNECT'`.

#### Parameter: `ResponseData`

* **statusCode** `number`
* **headers** `http.IncomingHttpHeaders`
* **body** `stream.Readable`
* **trailers** `Record<string, string>` - This object starts out
  as empty and will be mutated to contain trailers after `body` has emitted `'end'`.
* **opaque** `unknown`

#### Example 1 - Basic GET Request

```js
'use strict'
const { createServer } = require('http')
const { Client } = require('undici')

const server = createServer((request, response) => {
  response.end('Hello, World!')
})

server.listen(() => {
  const client = new Client(`http://localhost:${server.address().port}`)

  client.request({
    path: '/',
    method: 'GET'
  }).then(({ body, headers, statusCode, trailers }) => {
    console.log(`response received ${statusCode}`)
    console.log('headers', headers)
    body.setEncoding('utf8')
    body.on('data', console.log)
    body.on('end', () => {
      console.log('trailers', trailers)
    })

    client.close()
    server.close()
  }).catch(error => {
    console.error(error)
  })
})
```

#### Example 2 - Aborting a request

> Node.js v15+ is required to run this example

```js
'use strict'
const { createServer } = require('http')
const { Client } = require('undici')

const server = createServer((request, response) => {
  response.end('Hello, World!')
})

server.listen(() => {
  const client = new Client(`http://localhost:${server.address().port}`)
  const abortController = new AbortController()

  client.request({
    path: '/',
    method: 'GET',
    signal: abortController.signal
  }).catch(error => {
    console.error(error) // should print an RequestAbortedError
    client.close()
    server.close()
  })

  abortController.abort()

})
```

Alternatively, any `EventEmitter` that emits an `'abort'` event may be used as an abort controller:

```js
'use strict'
const EventEmitter = require('events')
const { createServer } = require('http')
const { Client } = require('undici')

const server = createServer((request, response) => {
  response.end('Hello, World!')
})

server.listen(() => {
  const client = new Client(`http://localhost:${server.address().port}`)
  const ee = new EventEmitter()

  client.request({
    path: '/',
    method: 'GET',
    signal: ee
  }).catch(error => {
    console.error(error) // should print an RequestAbortedError
    client.close()
    server.close()
  })

  ee.emit('abort')
})
```

Destroying the request or response body will have the same effect.

```js
'use strict'
const { createServer } = require('http')
const { Client } = require('undici')

const server = createServer((request, response) => {
  response.end('Hello, World!')
})

server.listen(() => {
  const client = new Client(`http://localhost:${server.address().port}`)

  client.request({
    path: '/',
    method: 'GET',
  }).then(({ body }) => {
    body.destroy()
  }).catch(error => {
    console.error(error) // should print an RequestAbortedError
    client.close()
    server.close()
  })
})
```

### `Dispatcher.stream(options, factory[, callback])`

A faster version of `Dispatcher.request`. This method expects the second argument `factory` to return a [`stream.Writable`](https://nodejs.org/api/stream.html#stream_class_stream_writable) stream which the response will be written to. This improves performance by avoiding creating an intermediate [`stream.Readable`](https://nodejs.org/api/stream.html#stream_readable_streams) stream when the user expects to directly pipe the response body to a [`stream.Writable`](https://nodejs.org/api/stream.html#stream_class_stream_writable) stream.

As demonstrated in [Example 1 - Basic GET stream request](#example-1---basic-get-stream-request), it is recommended to use the `option.opaque` property to avoid creating a closure for the `factory` method. This pattern works well with Node.js Web Frameworks such as [Fastify](https://fastify.io). See [Example 2 - Stream to Fastify Response](#example-2---stream-to-fastify-response) for more details.

Arguments:

* **options** `RequestOptions`
* **factory** `(data: StreamFactoryData) => stream.Writable`
* **callback** `(error: Error | null, data: StreamData) => void` (optional)

Returns: `void | Promise<StreamData>` - Only returns a `Promise` if no `callback` argument was passed

#### Parameter: `StreamFactoryData`

* **statusCode** `number`
* **headers** `http.IncomingHttpHeaders`
* **opaque** `unknown`

#### Parameter: `StreamData`

* **opaque** `unknown`
* **trailers** `Record<string, string>`

#### Example 1 - Basic GET stream request

```js
'use strict'
const { createServer } = require('http')
const { Client } = require('undici')
const { Writable } = require('stream')

const server = createServer((request, response) => {
  response.end('Hello, World!')
})

server.listen(() => {
  const client = new Client(`http://localhost:${server.address().port}`)

  const bufs = []

  client.stream({
    path: '/',
    method: 'GET',
    opaque: { bufs }
  }, ({ statusCode, headers, opaque: { bufs } }) => {
    console.log(`response received ${statusCode}`)
    console.log('headers', headers)
    return new Writable({
      write (chunk, encoding, callback) {
        bufs.push(chunk)
        callback()
      }
    })
  }).then(({ opaque: { bufs } }) => {
    console.log(Buffer.concat(bufs).toString('utf-8'))

    client.close()
    server.close()
  }).catch(error => {
    console.error(error)
  })
})
```

#### Example 2 - Stream to Fastify Response

In this example, a (fake) request is made to the fastify server using `fastify.inject()`. This request then executes the fastify route handler which makes a subsequent request to the raw Node.js http server using `undici.dispatcher.stream()`. The fastify response is passed to the `opaque` option so that undici can tap into the underlying writable stream using `response.raw`. This methodology demonstrates how one could use undici and fastify together to create fast-as-possible requests from one backend server to another.

```js
'use strict'

const { createServer } = require('http')
const undici = require('undici')
const fastify = require('fastify')

const nodeServer = createServer((request, response) => {
  response.end('Hello, World! From Node.js HTTP Server')
})

nodeServer.listen(() => {
  console.log('Node Server listening')

  const nodeServerUndiciClient = new undici.Client(`http://localhost:${nodeServer.address().port}`)

  const fastifyServer = fastify()

  fastifyServer.route({
    url: '/',
    method: 'GET',
    handler: (request, response) => {
      nodeServerUndiciClient.stream({
        path: '/',
        method: 'GET',
        opaque: response
      }, ({ opaque }) => opaque.raw)
    }
  })

  fastifyServer
    .listen()
    .then(() => {
      console.log('Fastify Server listening')
      const fastifyServerUndiciClient = new undici.Client(`http://localhost:${fastifyServer.server.address().port}`)

      fastifyServerUndiciClient.request({
        path: '/',
        method: 'GET'
      }).then(({ statusCode, body }) => {
        console.log(`response received ${statusCode}`)
        body.setEncoding('utf8')
        body.on('data', console.log)

        nodeServerUndiciClient.close()
        fastifyServerUndiciClient.close()
        fastifyServer.close()
        nodeServer.close()
      })
    })
})
```

### `Dispatcher.upgrade(options[, callback])`

Upgrade to a different protocol. Visit [MDN - HTTP - Protocol upgrade mechanism](https://developer.mozilla.org/en-US/docs/Web/HTTP/Protocol_upgrade_mechanism) for more details.

Arguments:

* **options** `UpgradeOptions`
  
* **callback** `(error: Error | null, data: UpgradeData) => void` (optional)

Returns: `void | Promise<UpgradeData>` - Only returns a `Promise` if no `callback` argument was passed

#### Parameter: `UpgradeOptions`

* **path** `string`
* **method** `string` (optional) - Default: `'GET'`
* **headers** `UndiciHeaders` (optional) - Default: `null`
* **protocol** `string` (optional) - Default: `'Websocket'` - A string of comma separated protocols, in descending preference order.
* **signal** `AbortSignal | EventEmitter | null` (optional) - Default: `null`

#### Parameter: `UpgradeData`

* **headers** `http.IncomingHeaders`
* **socket** `stream.Duplex`
* **opaque** `unknown`

#### Example 1 - Basic Upgrade Request

```js
'use strict'
const { Client } = require('undici')
const { createServer } = require('http')

const server = createServer((request, response) => {
  response.statusCode = 101
  response.setHeader('connection', 'upgrade')
  response.setHeader('upgrade', request.headers.upgrade)
  response.end()
})

server.listen(() => {
  const client = new Client(`http://localhost:${server.address().port}`)

  client
    .upgrade({ path: '/' })
    .then(({ headers, socket }) => {
      socket.on('end', () => {
        console.log(`upgrade: ${headers.upgrade}`)
        client.close()
        server.close()
      })
      socket.end()
    })
    .catch(error => {
      console.error(error)
      client.close()
      server.close()
    })
})
```

## `Dispatcher.close([callback]): Promise`

Closes the dispatcher and gracefully waits for enqueued requests to complete before resolving.

Arguments:

* **callback** `(error: Error | null, data: null) => void` (optional)

Returns: `void | Promise<null>` - Only returns a `Promise` if no `callback` argument was passed

```js
dispatcher.close() // -> Promise
dispatcher.close(() => {}) // -> void
```

#### Example - Request resolves before Client closes

```js
'use strict'
const { createServer } = require('http')
const { Client } = require('undici')

const server = createServer((request, response) => {
  response.end('undici')
})

server.listen(() => {
  const client = new Client(`http://localhost:${server.address().port}`)

  const request = client.request({
    path: '/',
    method: 'GET'
  })

  client.close()
    .then(() => {
      // This waits for the previous request to complete
      console.log('Client closed')
      server.close()
    })

  request.then(({ body }) => {
    body.setEncoding('utf8')
    body.on('data', console.log) // This logs before 'Client closed'
  })
})
```

## `Dispatcher.destroy([error, callback]): Promise`

Destroy the dispatcher abruptly with the given error. All the pending and running requests will be asynchronously aborted and error. Since this operation is asynchronously dispatched there might still be some progress on dispatched requests.

Both arguments are optional; the method can be called in four different ways:

Arguments:

* **error** `Error | null` (optional)
* **callback** `(error: Error | null, data: null) => void` (optional)

Returns: `void | Promise<void>` - Only returns a `Promise` if no `callback` argument was passed

```js
dispatcher.destroy() // -> Promise
dispatcher.destroy(new Error()) // -> Promise
dispatcher.destroy(() => {}) // -> void
dispatcher.destroy(new Error(), () => {}) // -> void
```

#### Example - Request is aborted when Client is destroyed

```js
'use strict'
const { createServer } = require('http')
const { Client } = require('undici')

const server = createServer((request, response) => {
  response.end('undici')
})

server.listen(() => {
  const client = new Client(`http://localhost:${server.address().port}`)

  const request = client.request({
    path: '/',
    method: 'GET'
  })

  client.destroy()
    .then(() => {
      // Still waits for requests to complete
      console.log('Client destroyed')
      server.close()
    })

  // The request promise will reject with an Undici Client Destroyed error
  request.catch(error => {
    console.error(error)
  })
})
```

### `Dispatcher.dispatch(options, handlers)`

Dispatches a request.

This API is expected to evolve through semver-major versions and is less stable than the preceding higher level APIs. It is primarily intended for library developers who implement higher level APIs on top of this.

Arguments:

* **options** `DispatchOptions`
* **handlers** `DispatchHandlers`

Returns: `Boolean`, `false` if user should wait for `'drain'` event before calling `Dispatcher.dispatch` again.

#### Parameter: `DispatchOptions`

* **origin** `string | URL`
* **path** `string`
* **method** `string`
* **body** `string | Buffer | Uint8Array | stream.Readable | null` (optional) - Default: `null`
* **headers** `UndiciHeaders` (optional) - Default: `null`
* **idempotent** `boolean` (optional) - Default: `true` if `method` is `'HEAD'` or `'GET'` - Whether the requests can be safely retried or not. If `false` the request won't be sent until all preceding requests in the pipeline has completed.
* **upgrade** `string | null` (optional) - Default: `method === 'CONNECT' || null` - Upgrade the request. Should be used to specify the kind of upgrade i.e. `'Websocket'`.

#### Parameter: `DispatchHandlers`

* **onConnect** `(abort: () => void) => void` - Invoked before request is dispatched on socket. May be invoked multiple times when a request is retried when the request at the head of the pipeline fails.
* **onError** `(error: Error) => void` - Invoked when an error has occurred.
* **onUpgrade** `(statusCode: number, headers: string[] | null, socket: Duplex) => void` (optional) - Invoked when request is upgraded. Required if `DispatchOptions.upgrade` is defined or `DispatchOptions.method === 'CONNECT'`.
* **onHeaders** `(statusCode: number, headers: Buffer[] | null, resume: () => void) => boolean` - Invoked when statusCode and headers have been received. May be invoked multiple times due to 1xx informational headers. Not required for `upgrade` requests.
* **onData** `(chunk: Buffer) => boolean` - Invoked when response payload data is received. Not required for `upgrade` requests.
* **onComplete** `(trailers: string[] | null) => void` - Invoked when response payload and trailers have been received and the request has completed. Not required for `upgrade` requests.

## Instance Events

### Event: `'connect'`

Parameters:

* **origin** `URL`
* **targets** `Array<Dispatcher>`

### Event: `'disconnect'`

Parameters:

* **origin** `URL`
* **targets** `Array<Dispatcher>`
* **error** `Error`

### Event: `'drain'`

Parameters:

* **origin** `URL`

Emitted when dispatcher is no longer busy.
