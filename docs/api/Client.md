# Class: Client

Extends: `undici.Dispatcher`

A basic HTTP/1.1 client, mapped on top a single TCP/TLS connection. Pipelining is disabled by default.

Requests are not guaranteed to be dispatched in order of invocation.

## `new Client(url[, options])`

Arguments:

* **url** `URL | string` - Should only include the **protocol, hostname, and port**.
* **options** `ClientOptions` (optional)

Returns: `Client`

### Parameter: `ClientOptions`

* **bodyTimeout** `number | null` (optional) - Default: `30e3` - the timeout after which a request will time out, in milliseconds. Monitors time between receiving body data. Use `0` to disable it entirely. Defaults to 30 seconds.
* **headersTimeout** `number | null` (optional) - Default: `30e3` - The amount of time the parser will wait to receive the complete HTTP headers. Defaults to 30 seconds.
* **keepAliveMaxTimeout** `number | null` (optional) - Default: `600e3` - The maximum allowed `keepAliveTimeout` when overridden by *keep-alive* hints from the server. Defaults to 10 minutes.
* **keepAliveTimeout** `number | null` (optional) - Default: `4e3` - The timeout after which a socket without active requests will time out. Monitors time between activity on a connected socket. This value may be overridden by *keep-alive* hints from the server. See [MDN: HTTP - Headers - Keep-Alive directives](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Keep-Alive#directives) for more details. Defaults to 4 seconds.
* **keepAliveTimeoutThreshold** `number | null` (optional) - Default: `1e3` - A number subtracted from server *keep-alive* hints when overriding `keepAliveTimeout` to account for timing inaccuracies caused by e.g. transport latency. Defaults to 1 second.
* **maxHeaderSize** `number | null` (optional) - Default: `16384` - The maximum length of request headers in bytes. Defaults to 16KiB.
* **pipelining** `number | null` (optional) - Default: `1` - The amount of concurrent requests to be sent over the single TCP/TLS connection according to [RFC7230](https://tools.ietf.org/html/rfc7230#section-6.3.2). Carefully consider your workload and environment before enabling concurrent requests as pipelining may reduce performance if used incorrectly. Pipelining is sensitive to network stack settings as well as head of line blocking caused by e.g. long running requests. Set to `0` to disable keep-alive connections.
* **socketPath** `string | null` (optional) - Default: `null` - An IPC endpoint, either Unix domain socket or Windows named pipe.
* **tls** `TlsOptions | null` (optional) - Default: `null` - An options object which in the case of `https` will be passed to [`tls.connect`](https://nodejs.org/api/tls.html#tls_tls_connect_options_callback).
* **strictContentLength** `Boolean` (optional) - Default: `true` - Whether to treat request content length mismatches as errors. If true, an error is thrown when the request content-length header doesn't match the length of the request body.

### Example - Basic Client instantiation

This will instantiate the undici Client, but it will not connect to the origin until something is queued. Consider using `client.connect` to prematurely connect to the origin, or just call `client.request`.

```js
'use strict'
const { Client } = require('undici')

const client = new Client('http://localhost:3000')
```

## Instance Methods

### `Client.close([callback])`

Implements [`Dispatcher.close([callback])`](docs/api/Dispatcher.md#clientclose-callback-).

### `Client.destroy([error, callback])`

Implements [`Dispatcher.destroy([error, callback])`](docs/api/Dispatcher.md#dispatcher-callback-).

Waits until socket is closed before invoking the callback (or returning a promise if no callback is provided).

Implements [`Dispatcher.destroy([error, callback])`](docs/api/Dispatcher.md#dispatcher-callback-).

### `Client.connect(options[, callback])`

See [`Dispatcher.connect(options[, callback])`](docs/api/Dispatcher.md#clientconnectoptions--callback).

### `Client.dispatch(options, handlers)`

Implements [`Dispatcher.dispatch(options, handlers)`](docs/api/Dispatcher.md#clientdispatchoptions-handlers).

### `Client.pipeline(options, handler)`

See [`Dispatcher.pipeline(options, handler)`](docs/api/Dispatcher.md#clientpipelineoptions-handler).

### `Client.request(options[, callback])`

See [`Dispatcher.request(options [, callback])`](docs/api/Dispatcher.md#clientrequestoptions--callback).

### `Client.stream(options, factory[, callback])`

See [`Dispatcher.stream(options, factory[, callback])`](docs/api/Dispatcher.md#clientstreamoptions-factory--callback).

### `Client.upgrade(options[, callback])`

See [`Dispatcher.upgrade(options[, callback])`](docs/api/Dispatcher.md#clientupgradeoptions-callback).

## Instance Properties

### `Client.busy`

* `boolean`

`true` if pipeline is saturated or blocked. Indicates whether dispatching further requests is meaningful.

### `Client.closed`

* `boolean`

`true` after `client.close()` has been called.

### `Client.destroyed`

* `boolean`

`true` after `client.destroyed()` has been called or `client.close()` has been called and the client shutdown has completed.

### `Client.pipelining`

* `number`

Property to get and set the pipelining factor.

## Instance Events

### Event: `'connect'`

See [Dispatcher Event: `'connect'`](docs/api/Dispatcher.md#event-connect).

Parameters:

* **origin** `URL`
* **targets** `Array<Dispatcher>`

Emitted when a socket has been created and connected. The client will connect once `client.size > 0`.

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

  client.on('connect', (origin) => {
    console.log(`Connected to ${origin}`) // should print before the request body statement
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

See [Dispatcher Event: `'disconnect'`](docs/api/Dispatcher.md#event-disconnect).

Parameters:

* **origin** `URL`
* **targets** `Array<Dispatcher>`
* **error** `Error`

Emitted when socket has disconnected. The error argument of the event is the error which caused the socket to disconnect. The client will reconnect if or once `client.size > 0`.

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

  client.on('disconnect', (origin) => {
    console.log(`Disconnected from ${origin}`) // should print before the SocketError
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

See [Dispatcher Event: `'drain'`](docs/api/Dispatcher.md#event-drain).

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
