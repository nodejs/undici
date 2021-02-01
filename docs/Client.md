# Class: Client

Extends: `EventEmitter`

## `new Client(url, [options])`

* **url** `URL | string`
* **options** `object` (optional)
  * **bodyTimeout** `number | null` (optional) - Default: `30e3` -
  * **headersTimeout** `number | null` (optional) - Default: `30e3` - Node.js v14+ - The amount of time the parser will wait to receive the complete HTTP headers. Defaults to 30 seconds.
  * **keepAliveMaxTimeout** `number | null` (optional) - Default: `600e3` - The maximum allowed `idleTimeout` when overriden by *keep-alive* hints from the server. Defaults to 10 minutes.
  * **keepAliveTimeout** `number | null` (optional) - Default: `4e3` - The timeout after which a socket without active requests will time out. Monitors time between activity on a connected socket. This value may be overriden by *keep-alive* hints from the server. Defaults to 4 seconds.
  * **keepAliveTimeoutThreshold** `number | null` (optional) - Default: `1e3` - A number subtracted from server *keep-alive* hints when overriding `idleTimeout` to account for timing inaccuries caused by e.g. transport latency. Defaults to 1 second.
  * **maxHeaderSize** `number | null` (optional) - Default: `16384` - The maximum length of request headers in bytes. Defaults to 16KiB.
  * **pipelining** `number | null` (optional) - Default: `1` - The amount of concurrent requests to be sent over the single TCP/TLS connection according to [RFC7230](https://tools.ietf.org/html/rfc7230#section-6.3.2).
  * **socketPath** `string | null` (optional) - Default: `null` - An IPC endpoint, either Unix domain socket or Windows named pipe.
  * **tls** `TlsOptions | null` (optional) - Default: `null` - An options object which in the case of `https` will be passed to [`tls.connect`](https://nodejs.org/api/tls.html#tls_tls_connect_options_callback).

## Instance Methods

### `Client.close()` _(overloaded)_

Closes the client and gracefully waits for enqueued requests to complete before invoking the callback (or returnning a promise if no callback is provided).

#### `Client.close()`

Returns: `Promise<void>`

#### `Client.close(callback)`

Arguments:

* **callback** `() => void`

### `Client.connect()` _(overloaded)_

Starts two-way communications with the requested resource.

#### `Client.connect(options)`

Arguments:

* **options** `ConnectOptions`

Returns: `Promise<ConnectData>`

#### `Client.connect(options, callback)`

Arguments:

* **options** `ConnectOptions`
* **callback** `(err: Error, data: ConnectData) => void`

#### Interface: ConnectOptions

* **path** `string`
* **headers** `IncomingHttpHeaders | null` (optional) - Default: `null`
* **headersTimeout** `number` (optional) - Default: `30e3` - The timeout after which a request will time out, in milliseconds. Monitors time between receiving a complete headers. Use 0 to disable it entirely. Defaults to 30 seconds.
* **signal** `AbortSignal | EventEmitter | null` (optional) - Default: `null`

#### Interface: ConnectData

* **statusCode** `number`
* **headers** `IncomingHttpHeaders`
* **socket** `Duplex`
* **opaque** `unknown`

### `Client.destroy()`

### `Client.dispatch()`

### `Client.pipeline()`

### `Client.request()`

### `Client.stream()`

### `Client.upgrade()`

## Instance Properties

### `Client.busy`

### `Client.closed`

### `Client.connected`

### `Client.destroyed`

### `Client.pending`

### `Client.pipelining`

### `Client.running`

### `Client.size`