# Agent

## `new undici.Agent(opts)`

Arguments:

* **factory** - Default: `(origin, opts) => new Pool(origin, opts)`
* // TODO: document rest opts?

Returns: `Agent`

Returns a new Agent instance used for dispatching requests.

### `Agent.get(origin)`

* origin `string` - A origin to be retrieved from the Agent.

This method retrieves Client instances from the Agent. If the client does not exist it is automatically added by calling
the `factory` method passed through the `Agent` constructor.

### `Agent.dispatch(options, handlers)`

Dispatches a request.

This API is expected to evolve through semver-major versions and is less stable than the preceding higher level APIs. It is primarily intended for library developers who implement higher level APIs on top of this.

Arguments:

* **options** `DispatchOptions`
* **handlers** `DispatchHandlers`

Returns: `void`

#### Parameter: `DispatchOptions`

* **origin** `string | URL`
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

## `agent.close(): Promise`

Returns a `Promise.all` operation closing all of the pool instances in the Agent instance. This calls `pool.close` under the hood.

## `agent.destroy(): Promise`

Returns a `Promise.all` operation destroying all of the pool instances in the Agent instance. This calls `pool.destroy` under the hood.

## `undici.setGlobalAgent(agent)`

* agent `Agent`

Sets the global agent used by `request`, `pipeline`, and `stream` methods.
The default global agent creates `undici.Pool`s with no max number of
connections.

The agent must only **implement** the `Agent` API; not necessary extend from it.

## `undici.getGlobalAgent(agent)`

TODO: document

## `undici.request(url[, opts]): Promise`

* url `string | URL | object`
* opts `{ agent: Agent } & client.request.opts`
* // TODO: document maxRedirections?

`url` may contain path. `opts` may not contain path. `opts.method` is `GET` by default.
Calls `pool.request(opts)` on the pool returned from either the globalAgent (see [setGlobalAgent](#undicisetglobalagentagent)) or the agent passed to the `opts` argument.

Returns a promise with the result of the `request` method.

## `undici.stream(url, opts, factory): Promise`

* url `string | URL | object`
* opts `{ agent: Agent } & client.stream.opts`
* factory `client.stream.factory`
* // TODO: document maxRedirections?

`url` may contain path. `opts` may not contain path.
See [client.stream](docs/api/Client.md#clientstreamoptions-factory--callback) for details on the `opts` and `factory` arguments.
Calls `pool.stream(opts, factory)` on the pool returned from either the globalAgent (see [setGlobalAgent](#undicisetglobalagentagent)) or the agent passed to the `opts` argument.
Result is returned in the factory function. See [client.stream](docs/api/Client.md#clientstreamoptions-factory--callback) for more details.

## `undici.pipeline(url, opts, handler): Duplex`

* url `string | URL | object`
* opts `{ agent: Agent } & client.pipeline.opts`
* handler `client.pipeline.handler`
* // TODO: document maxRedirections?

`url` may contain path. `opts` may not contain path.

See [client.pipeline](docs/api/Client.md#clientpipelining) for details on the `opts` and `handler` arguments.

Calls `pool.pipeline(opts, factory)` on the pool returned from either the globalAgent (see [setGlobalAgent](#undicisetglobalagentagent)) or the agent passed to the `opts` argument.

See [client.pipeline](docs/api/Client.md#clientpipelining) for more details.

### `undici.connect(options[, callback])`

TODO: document

### `undici.upgrade(options[, callback])`

TODO: document
