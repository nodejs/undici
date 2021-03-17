# Class: Pool

Extends: `events.EventEmitter`

A pool of [Client](docs/api/Client.md) instances connected to the same upstream target. Implements the same api as [Client](docs/api/Client.md).

Requests are not guaranteed to be dispatched in order of invocation.

## `new Pool(url, [options])`

Arguments:

* **url** `URL | string` - It should only include the **protocol, hostname, and port**.
* **options** `PoolOptions` (optional)

### Parameter: `PoolOptions`

Extends: [`ClientOptions`](docs/api/Client.md#parameter-clientoptions)

* **connections** `number | null` (optional) - Default: `null` - The number of `Client` instances to create. When set to `null`, the `Pool` instance will create an unlimited amount of `Client` instances.

## Instance Properties

### `Pool.busy`

Implements [Client.busy](docs/api/Client.md#clientbusy)

### `Pool.closed`

Implements [Client.closed](docs/api/Client.md#clientclosed)

### `Pool.connected`

Implements [Client.connected](docs/api/Client.md#clientconnected)

### `Pool.destroyed`

Implements [Client.destroyed](docs/api/Client.md#clientdestroyed)

### `Pool.pending`

Implements [Client.pending](docs/api/Client.md#clientpending)

<!-- TODO: https://github.com/nodejs/undici/issues/561 
### `Pool.pipelining`

Implements [Client.pipelining](docs/api/Client.md#clientpipelining) -->

### `Pool.running`

Implements [Client.running](docs/api/Client.md#clientrunning)

### `Pool.size`

Implements [Client.size](docs/api/Client.md#clientsize)

### `Pool.url`

Implements [Client.url](docs/api/Client.md#clienturl)

## Instance Methods

### `Pool.close(callback)`

Implements [`Client.close([ callback ])`](docs/api/Client.md#clientclose-callback-)

### `Pool.connect(options [, callback])`

Implements [`Client.connect(options [, callback])`](docs/api/Client.md#clientconnectoptions--callback)

### `Pool.destroy(error)`

Implements [`Client.destroy(error)`](docs/api/Client.md#clientdestroyerror)

### `Pool.dispatch(options, handlers)`

Implements [`Client.dispatch(options, handlers)`](docs/api/Client.md#clientdispatchoptions-handlers)

### `Pool.pipeline(options, handler)`

Implements [`Client.pipeline(options, handler)`](docs/api/Client.md#clientpipelineoptions-handler)

### `Pool.request(options [, callback])`

Implements [`Client.request(options [, callback])`](docs/api/Client.md#clientrequestoptions--callback)

### `Pool.stream(options, factory, [, callback])`

Implements [`Client.stream(options, factory [, callback])`](docs/api/Client.md#clientstreamoptions-factory--callback)

### `Pool.upgrade(options [, callback])`

Implements [`Client.upgrade(options[, callback])`](docs/api/Client.md#clientupgradeoptions-callback)

## Instance Events

### Event: `'connect'`

Implements [Client Event: `'connect'`](docs/api/Client.md#event-connect)

### Event: `'disconnect'`

Implements [Client Event: `'disconnect'`](docs/api/Client.md#event-connect)

### Event: `'drain'`

Implements [Client Event: `'drain'`](docs/api/Client.md#event-connect)

# Class: RedirectPool

Extends: `Pool`

A pool which will automatically follow redirections.

When used, the option `maxRedirections` can be additionally provided to top level `request`, `stream` and `pipeline`. The option must be a boolean or a number:

* If omitted or set to `true`, up to 10 redirections are followed.

* If set to `false`, redirections are not followed.

* If set to a positive number, it specifies the maximum number of redirections to follow.

The data returned by the top-level method (via callback or promise) will contain the additional property `redirections` that lists all the followed redirections, in order.
