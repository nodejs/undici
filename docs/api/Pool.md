# Class: Pool

Extends: `undici.Dispatcher`

A pool of [Client](docs/api/Client.md) instances connected to the same upstream target.

Requests are not guaranteed to be dispatched in order of invocation.

## `new Pool(url[, options])`

Arguments:

* **url** `URL | string` - It should only include the **protocol, hostname, and port**.
* **options** `PoolOptions` (optional)

### Parameter: `PoolOptions`

Extends: [`ClientOptions`](docs/api/Client.md#parameter-clientoptions)

* **factory** `(origin: URL, opts: Object) => Dispatcher` - Default: `(origin, opts) => new Client(origin, opts)`
* **connections** `number | null` (optional) - Default: `null` - The number of `Client` instances to create. When set to `null`, the `Pool` instance will create an unlimited amount of `Client` instances.

## Instance Properties

### `Pool.closed`

Implements [Client.closed](docs/api/Client.md#clientclosed)

### `Pool.destroyed`

Implements [Client.destroyed](docs/api/Client.md#clientdestroyed)

## Instance Methods

### `Pool.close([callback])`

Implements [`Dispatcher.close([callback])`](docs/api/Dispatcher.md#clientclose-callback-).

### `Pool.destroy([error, callback])`

Implements [`Dispatcher.destroy([error, callback])`](docs/api/Dispatcher.md#dispatcher-callback-).

### `Pool.connect(options[, callback])`

See [`Dispatcher.connect(options[, callback])`](docs/api/Dispatcher.md#clientconnectoptions--callback).

### `Pool.dispatch(options, handlers)`

Implements [`Dispatcher.dispatch(options, handlers)`](docs/api/Dispatcher.md#clientdispatchoptions-handlers).

### `Pool.pipeline(options, handler)`

See [`Dispatcher.pipeline(options, handler)`](docs/api/Dispatcher.md#clientpipelineoptions-handler).

### `Pool.request(options[, callback])`

See [`Dispatcher.request(options [, callback])`](docs/api/Dispatcher.md#clientrequestoptions--callback).

### `Pool.stream(options, factory[, callback])`

See [`Dispatcher.stream(options, factory[, callback])`](docs/api/Dispatcher.md#clientstreamoptions-factory--callback).

### `Pool.upgrade(options[, callback])`

See [`Dispatcher.upgrade(options[, callback])`](docs/api/Dispatcher.md#clientupgradeoptions-callback).

## Instance Events

### Event: `'connect'`

See [Dispatcher Event: `'connect'`](docs/api/Dispatcher.md#event-connect).

### Event: `'disconnect'`

See [Dispatcher Event: `'disconnect'`](docs/api/Dispatcher.md#event-connect).

### Event: `'drain'`

See [Dispatcher Event: `'drain'`](docs/api/Dispatcher.md#event-connect).
