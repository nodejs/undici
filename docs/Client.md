# Class: Client

Extends: `events.EventEmitter`

A basic HTTP/1.1 client, mapped on top a single TCP/TLS connection. Pipelining is disabled by default.

Imports: `http`, `stream`, `events`

- [Class: Client](#class-client)
  - [`new Client(url, [options])`](#new-clienturl-options)
    - [Example - Basic Client instantiation](#example---basic-client-instantiation)
  - [Instance Methods](#instance-methods)
    - [`Client.close([ callback ])`](#clientclose-callback-)
      - [Example - Request resolves before Client closes](#example---request-resolves-before-client-closes)
    - [`Client.connect(options [, callback])`](#clientconnectoptions--callback)
      - [Parameter: `ConnectOptions`](#parameter-connectoptions)
      - [Parameter: `ConnectData`](#parameter-connectdata)
      - [Example - Connect request with echo](#example---connect-request-with-echo)
    - [`Client.destroy(error)`](#clientdestroyerror)
      - [Example - Request is aborted when Client is destroyed](#example---request-is-aborted-when-client-is-destroyed)
    - [`Client.dispatch(options, handlers)`](#clientdispatchoptions-handlers)
      - [Example 1 - Dispatch GET request](#example-1---dispatch-get-request)
      - [Example 2 - Dispatch Upgrade Request](#example-2---dispatch-upgrade-request)
      - [Parameter: `DispatchOptions`](#parameter-dispatchoptions)
      - [Parameter: `DispatchHandlers`](#parameter-dispatchhandlers)
    - [`Client.pipeline(options, handler)`](#clientpipelineoptions-handler)
      - [Parameter: PipelineOptions](#parameter-pipelineoptions)
      - [Parameter: PipelineHandlerData](#parameter-pipelinehandlerdata)
      - [Example 1 - Pipeline Echo](#example-1---pipeline-echo)
    - [`Client.request(options [, callback])`](#clientrequestoptions--callback)
      - [Parameter: `RequestOptions`](#parameter-requestoptions)
      - [Parameter: `ResponseData`](#parameter-responsedata)
      - [Example 1 - Basic GET Request](#example-1---basic-get-request)
      - [Example 2 - Aborting a request](#example-2---aborting-a-request)
    - [`Client.stream(options, factory [, callback])`](#clientstreamoptions-factory--callback)
      - [Parameter: `StreamFactoryData`](#parameter-streamfactorydata)
      - [Parameter: `StreamData`](#parameter-streamdata)
      - [Example 1 - Basic GET stream request](#example-1---basic-get-stream-request)
      - [Example 2 - Stream to Fastify Response](#example-2---stream-to-fastify-response)
    - [`Client.upgrade(options[, callback])`](#clientupgradeoptions-callback)
      - [Parameter: `UpgradeOptions`](#parameter-upgradeoptions)
      - [Parameter: `UpgradeData`](#parameter-upgradedata)
      - [Example 1 - Basic Upgrade Request](#example-1---basic-upgrade-request)
  - [Instance Properties](#instance-properties)
    - [`Client.busy`](#clientbusy)
    - [`Client.closed`](#clientclosed)
    - [`Client.connected`](#clientconnected)
    - [`Client.destroyed`](#clientdestroyed)
    - [`Client.pending`](#clientpending)
    - [`Client.pipelining`](#clientpipelining)
    - [`Client.running`](#clientrunning)
    - [`Client.size`](#clientsize)
  - [Instance Events](#instance-events)
    - [Event: `'connect'`](#event-connect)
      - [Example - Client connect event](#example---client-connect-event)
    - [Event: `'disconnect'`](#event-disconnect)
      - [Example - Client disconnect event](#example---client-disconnect-event)
    - [Event: `'drain'`](#event-drain)
      - [Example - Client drain event](#example---client-drain-event)
  - [Parameter: `UndiciHeaders`](#parameter-undiciheaders)
    - [Example 1 - Object](#example-1---object)
    - [Example 2 - Array](#example-2---array)

## `new Client(url, [options])`

Arguments:

* **url** `URL | string` - It should only include the protocol, hostname, and port.
* **options** `object` (optional)
  * **bodyTimeout** `number | null` (optional) - Default: `30e3` -
  * **headersTimeout** `number | null` (optional) - Default: `30e3` - Node.js v14+ - The amount of time the parser will wait to receive the complete HTTP headers. Defaults to 30 seconds.
  * **keepAliveMaxTimeout** `number | null` (optional) - Default: `600e3` - The maximum allowed `idleTimeout` when overriden by *keep-alive* hints from the server. Defaults to 10 minutes.
  * **keepAliveTimeout** `number | null` (optional) - Default: `4e3` - The timeout after which a socket without active requests will time out. Monitors time between activity on a connected socket. This value may be overriden by *keep-alive* hints from the server. Defaults to 4 seconds.
  * **keepAliveTimeoutThreshold** `number | null` (optional) - Default: `1e3` - A number subtracted from server *keep-alive* hints when overriding `idleTimeout` to account for timing inaccuries caused by e.g. transport latency. Defaults to 1 second.
  * **maxHeaderSize** `number | null` (optional) - Default: `16384` - The maximum length of request headers in bytes. Defaults to 16KiB.
  * **pipelining** `number | null` (optional) - Default: `1` - The amount of concurrent requests to be sent over the single TCP/TLS connection according to [RFC7230](https://tools.ietf.org/html/rfc7230#section-6.3.2). Carefully consider your workload and environment before enabling concurrent requests as pipelining may reduce performance if used incorrectly. Pipelining is sensitive to network stack settings as well as head of line blocking caused by e.g. long running requests. Set to `0` to disable keep-alive connections.
  * **socketPath** `string | null` (optional) - Default: `null` - An IPC endpoint, either Unix domain socket or Windows named pipe.
  * **tls** `TlsOptions | null` (optional) - Default: `null` - An options object which in the case of `https` will be passed to [`tls.connect`](https://nodejs.org/api/tls.html#tls_tls_connect_options_callback).

Returns: `Client`

### Example - Basic Client instantiation

```js
'use strict'
const { Client } = require('undici')

const client = Client('http://localhost:3000')
```

## Instance Methods

### `Client.close([ callback ])` 

Closes the client and gracefully waits for enqueued requests to complete before resolving.

Arguments:

* **callback** `(error: Error | null, data: null) => void` (optional)

Returns: `void | Promise<null>` - Only returns a `Promise` if no `callback` argument was passed

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

### `Client.connect(options [, callback])`

Starts two-way communications with the requested resource.

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

server.on('connect', (req, socket, firstBodyChunk) => {
  socket.write('HTTP/1.1 200 Connection established\r\n\r\n')

  let data = firstBodyChunk.toString()
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

### `Client.destroy([error][, callback])`

Destroy the client abruptly with the given error. All the pending and running requests will be asynchronously aborted and error. Waits until socket is closed before invoking the callback (or returnning a promise if no callback is provided). Since this operation is asynchronously dispatched there might still be some progress on dispatched requests.

Both arguments are optional; the method can be called in four different ways:

```js
client.destroy() // -> Promise
client.destroy(new Error()) // -> Promise
client.destroy(() => {}) // -> void
client.destroy(new Error(), () => {}) // -> void
```

Arguments:

* **error** `Error | null` (optional)
* **callback** `() => void` (optional)

Returns: `void | Promise<void>` - Only returns a `Promise` if no `callback` argument was passed

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

### `Client.dispatch(options, handlers)`

This is the low level API which all the preceding APIs are implemented on top of.

This API is expected to evolve through semver-major versions and is less stable than the preceding higher level APIs. It is primarily intended for library developers who implement higher level APIs on top of this.

Arguments:

* **options** `DispatchOptions`
* **handlers** `DispatchHandlers`

Returns: `void`

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

> ⚠️ Incomplete

```js
'use strict'
const { createServer } = require('http')
const { Client } = require('undici')

const server = createServer((request, response) => {
  response.end('Hello, World!')
})
server.listen(() => {
  const client = new Client(`http://localhost:${server.address().port}`)

  client.dispatch({
    path: '/',
    method: 'CONNECT',
  }, {
    onConnect: () => {},
    onError: (error) => {},
    onUpgrade: () => {}
  })

  client.dispatch({
    path: '/',
    upgrade: 'Websocket'
  }, {
    onConnect: () => {},
    onError: (error) => {},
    onUpgrade: () => {}
  })
})
```

#### Parameter: `DispatchOptions`

* **path** `string`
* **method** `string`
* **body** `string | Buffer | Uint8Array | stream.Readable | null` (optional) - Default: `null`
* **headers** `UndiciHeaders` (optional) - Default: `null`
* **idempotent** `boolean` (optional) - Default: `true` if `method` is `'HEAD'` or `'GET'` - Whether the requests can be safely retried or not. If `false` the request won't be sent until all preceeding requests in the pipeline has completed.
* **upgrade** `string | null` (optional) - Default: `method === 'CONNECT' || null` - Upgrade the request. Should be used to specify the kind of upgrade i.e. `'Websocket'`.

#### Parameter: `DispatchHandlers`

* **onConnect** `(abort: () => void) => void` - Invoked before request is dispatched on socket. May be invoked multiple times when a request is retried when the request at the head of the pipeline fails.
* **onError** `(error: Error) => void` - Invoked when an error has occurred.
* **onUpgrade** `(statusCode: number, headers: string[] | null, socket: Duplex) => void` (optional) - Invoked when request is upgraded. Required if `DispatchOptions.upgrade` is defined or `DispatchOptions.method === 'CONNECT'`.
* **onHeaders** `(statusCode: number, headers: string[] | null, resume: () => void) => boolean` - Invoked when statusCode and headers have been received. May be invoked multiple times due to 1xx informational headers. Not required for `upgrade` requests.
* **onData** `(chunk: Buffer) => boolean` - Invoked when response payload data is received. Not required for `upgrade` requests.
* **onComplete** `(trailers: string[] | null) => void` - Invoked when response payload and trailers have been received and the request has completed. Not required for `upgrade` requests.

### `Client.pipeline(options, handler)`

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

### `Client.request(options [, callback])`

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
  }).then(({ body, headesr, statusCode, trailers }) => {
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

### `Client.stream(options, factory [, callback])`

A faster version of `Client.request`. This method expects the second argument `factory` to return a [`Writable`](https://nodejs.org/api/stream.html#stream_class_stream_writable) stream which the response will be written to. This improves performance by avoiding creating an intermediate [`Readable`](https://nodejs.org/api/stream.html#stream_readable_streams) stream when the user expects to directly pipe the response body to a [`Writable`](https://nodejs.org/api/stream.html#stream_class_stream_writable) stream.

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
const stream = require('stream')

const { PassThrough } = require('stream')

const server = createServer((request, response) => {
  response.end('Hello, World!')
})

server.listen(() => {
  const client = new Client(`http://localhost:${server.address().port}`)

  const pt = new PassThrough()
  const bufs = []

  client.stream({
    path: '/',
    method: 'GET',
    opaque: { bufs, pt }
  }, ({ statusCode, headers, opaque: { pt, bufs } }) => {
    console.log(`response received ${statusCode}`)
    console.log('headers', headers)
    pt.on('data', buf => {
      bufs.push(buf)
    })
    return pt
  }).then(({ opaque: { bufs } }) => {

    console.log(Buffer.concat(bufs).toString('utf8'))

    client.close()
    server.close()
  }).catch(error => {
    console.error(error)
  })
})
```

#### Example 2 - Stream to Fastify Response

In this example, a (fake) request is made to the fastify server using `fastify.inject()`. This request then executes the fastify route handler which makes a subsequent request to the raw Node.js http server using `undici.client.stream()`. The fastify response is passed to the `opaque` option so that undici can tap into the underlying writable stream using `response.raw`. This methodology demonstrates how one could use undici and fastify together to create fast-as-possible requests from one backend server to another.

```js
'use strict'

const { createServer } = require('http')
const undici = require('undici')
const fastify = require('fastify')

const nodeServer = createServer((request, response) => {
  response.end('Hello, World! From Node.js HTTP Server')
})

const fastifyServer = fastify()

nodeServer.listen(0, () => {
  console.log('Node Server listening')

  const client = new undici.Client(`http://localhost:${nodeServer.address().port}`)

  fastifyServer.route({
    url: '/',
    method: 'GET',
    handler: (request, response) => {
      client.stream({
        path: '/',
        method: 'GET',
        opaque: response
      }, ({ opaque }) => opaque.raw)
    }
  })

  fastifyServer.listen(0, () => {
    console.log('Fastify Server listening')
    fastifyServer.inject({
      path: '/',
      method: 'GET'
    }).then(({ statusCode, body }) => {
      console.log(`response received ${statusCode}`)
      console.log('body:', body)

      client.close()
      fastifyServer.close()
      nodeServer.close()
    })
  })
})
```

### `Client.upgrade(options[, callback])`

Upgrade the client to a different protocol.

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

## Instance Properties

### `Client.busy`

* `boolean`

`true` if pipeline is saturated or blocked. Indicates whether dispatching further requests is meaningful.

### `Client.closed`

* `boolean`

`true` after `client.close()` has been called.

### `Client.connected`

* `boolean`

`true` if the client has an active connection. The client will lazily create a connection when it receives a request and will destroy it if there is no activity for the duration of the `timeout` value.

### `Client.destroyed`

* `boolean`

`true` after `client.destroyed()` has been called or `client.close()` has been called and the client shutdown has completed.

### `Client.pending`

* `number`

Number of queued requests.

### `Client.pipelining`

* `number`

Property to get and set the pipelining factor.

### `Client.running`

* `number`

Number of inflight requests.

### `Client.size`

* `number`

Number of pending and running requests.

## Instance Events

### Event: `'connect'`

Parameters:

* **client** `Client`

Emitted when a socket has been created and connected. The client will connect once `Client.size > 0`.

#### Example - Client connect event

```js
'use strict'
const { createServer } = require('http')
const { Client } = require('undici')

const server = createServer((request, response) => {
  response.end('Hello, World!')
})

server.listen(() => {
  const client = new Client(`http://localhost:${server.address().port}`)

  client.on('connect', client => {
    console.log(`Connected to ${client.url}`) // should print before the request body statement
  })

  client.request({
    path: '/',
    method: 'GET',
  }).then(({ body }) => {
    body.setEncoding('utf8')
    body.on('data', console.log)
    client.close()
    server.close()
  }).catch(error => {
    console.error(error)
    client.close()
    server.close()
  })
})
```

### Event: `'disconnect'`

Parameters:

* **error** `Error`

Emitted when socket has disconnected. The first argument of the event is the error which caused the socket to disconnect. The client will reconnect if or once `Client.size > 0`.

#### Example - Client disconnect event

```js
'use strict'
const { createServer } = require('http')
const { Client } = require('undici')

const server = createServer((request, response) => {
  response.destroy()
})

server.listen(() => {
  const client = new Client(`http://localhost:${server.address().port}`)

  client.on('disconnect', client => {
    console.log(`Disconnected from ${client.url}`) // should print before the SocketError
  })

  client.request({
    path: '/',
    method: 'GET',
  }).catch(error => {
    console.error(error.message)
    client.close()
    server.close()
  })
})
```

### Event: `'drain'`

Emitted when pipeline is no longer [`busy`](#clientbusy).

#### Example - Client drain event

```js
'use strict'
const { createServer } = require('http')
const { Client } = require('undici')

const server = createServer((request, response) => {
  response.end('Hello, World!')
})

server.listen(() => {
  const client = new Client(`http://localhost:${server.address().port}`)

  client.on('drain', () => {
    console.log('drain event')
    console.log(`Is Client busy: ${client.busy}`)
    client.close()
    server.close()
  })

  const requests = [
    client.request({ path: '/', method: 'GET' }),
    client.request({ path: '/', method: 'GET' }),
    client.request({ path: '/', method: 'GET' })
  ]

  console.log(`Is Client busy: ${client.busy}`)

  Promise.all(requests).then(() => {
    console.log('requests completed')
  })
})
```

## Parameter: `UndiciHeaders`

* `http.IncomingHttpHeaders | string[] | null`

Header arguments such as `options.headers` in [`Client.dispatch`](./Client.md#client-dispatchoptions-handlers) can be specified in two forms; either as an object specified by the `http.IncomingHttpHeaders` type, or an array of strings. An array representation of a header list must have an even length or an `InvalidArgumentError` will be thrown.

Keys are lowercase and values are not modified. 

Response headers will derive a `host` from the `url` of the [Client](#class-client) instance if no `host` header was previously specified.

### Example 1 - Object

```js
{
  'content-length': '123',
  'content-type': 'text/plain',
  connection: 'keep-alive',
  host: 'mysite.com',
  accept: '*/*'
}
```

### Example 2 - Array

```js
[
  'content-length', '123',
  'content-type', 'text/plain',
  'connection', 'keep-alive',
  'host', 'mysite.com',
  'accept', '*/*'
]
```
