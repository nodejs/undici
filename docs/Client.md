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

### `Client.close()` _(2 overloads)_

Closes the client and gracefully waits for enqueued requests to complete before invoking the callback (or returnning a promise if no callback is provided).

#### (1) `Client.close()`

Returns: `Promise<void>`

#### (2) `Client.close(callback)`

Arguments:

* **callback** `() => void`

### `Client.connect()` _(2 overloads)_

Starts two-way communications with the requested resource.

#### (1) `Client.connect(options)`

Arguments:

* **options** `ConnectOptions`

Returns: `Promise<ConnectData>`

#### (2) `Client.connect(options, callback)`

Arguments:

* **options** `ConnectOptions`
* **callback** `(err: Error, data: ConnectData) => void`

#### Parameter: ConnectOptions

* **path** `string`
* **headers** `IncomingHttpHeaders | null` (optional) - Default: `null`
* **headersTimeout** `number` (optional) - Default: `30e3` - The timeout after which a request will time out, in milliseconds. Monitors time between receiving a complete headers. Use 0 to disable it entirely. Defaults to 30 seconds.
* **signal** `AbortSignal | EventEmitter | null` (optional) - Default: `null`

#### Parameter: ConnectData

* **statusCode** `number`
* **headers** `IncomingHttpHeaders`
* **socket** `Duplex`
* **opaque** `unknown`

### `Client.destroy()` _(4 overloads)_

Destroy the client abruptly with the given error. All the pending and running requests will be asynchronously aborted and error. Waits until socket is closed before invoking the callback (or returnning a promise if no callback is provided). Since this operation is asynchronously dispatched there might still be some progress on dispatched requests.

#### (1) `Client.destroy()`

Returns: `Promise<void>`

#### (2) `Client.destroy(error)`

Arguments:

* **error** `Error | null`

Returns: `Promise<void>`

#### (3) `Client.destroy(callback)`

Arguments:

* **callback** `() => void`

#### (4) `Client.destroy(error, callback)`

Arguments:

* **error** `Error | null`
* **callback** `() => void`

### `Client.dispatch(options, handlers)`

This is the low level API which all the preceding APIs are implemented on top of. This API is expected to evolve through semver-major versions and is less stable than the preceding higher level APIs. It is primarily intended for library developers who implement higher level APIs on top of this.

Arguments:

* **options** `DispatchOptions`
* **handlers** `DispatchHandlers`

Returns: `void`

#### Parameter: DispatchOptions

* **path** `string`
* **method** `string`
* **body** `string | Buffer | Uint8Array | Readable | null` (optional) - Default: `null`
* **headers** `IncomingHttpHeaders | null` (optional) - Default: `null`
* **headersTimeout** `number` (optional) - Default: `30e3` - The timeout after which a request will time out, in milliseconds. Monitors time between receiving a complete headers. Use `0` to disable it entirely. Defaults to 30 seconds.
* **bodyTimeout** `number` (optional) - Default: `30e3` - The timeout after which a request will time out, in milliseconds. Monitors time between receiving body data. Use `0` to disable it entirely. Defaults to 30 seconds.
* **idempotent** `boolean` (optional) - Default: `true` if `method` is `'HEAD'` or `'GET'` - Whether the requests can be safely retried or not. If `false` the request won't be sent until all preceeding requests in the pipeline has completed.

#### Parameter: DispatchHandlers

* **onConnect** `(abort: () => void) => void` (optional) - Invoked before request is dispatched on socket. May be invoked multiple times when a request is retried when the request at the head of the pipeline fails.
* **onUpgrade** `(statusCode: number, headers: string[] | null, socket: Duplex) => void` (optional) - Invoked when request is upgraded either due to a `Upgrade` header or `CONNECT` method.
* **onHeaders** `(statusCode: number, headers: string[] | null, resume: () => void) => boolean` (optional) - Invoked when statusCode and headers have been received. May be invoked multiple times due to 1xx informational headers.
* **onData** `(chunk: Buffer) => boolean` (optional) - Invoked when response payload data is received.
* **onComplete** `(trailers: string[] | null) => void` (optional) - Invoked when response payload and trailers have been received and the request has completed.
* **onError** `(error: Error) => void` (optional) - Invoked when an error has occurred.

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