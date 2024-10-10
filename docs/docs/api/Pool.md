# Class: Pool

Extends: `undici.Dispatcher`

A pool of [Client](Client.md) instances connected to the same upstream target.

Requests are not guaranteed to be dispatched in order of invocation.

## `new Pool(url[, options])`

Arguments:

* **url** `URL | string` - It should only include the **protocol, hostname, and port**.
* **options** `PoolOptions` (optional)

### Parameter: `PoolOptions`

Extends: [`ClientOptions`](Client.md#parameter-clientoptions)

* **factory** `(origin: URL, opts: Object) => Dispatcher` - Default: `(origin, opts) => new Client(origin, opts)`
* **connections** `number | null` (optional) - Default: `null` - The number of `Client` instances to create. When set to `null`, the `Pool` instance will create an unlimited amount of `Client` instances.

## Instance Properties

### `Pool.closed`

Implements [Client.closed](Client.md#clientclosed)

### `Pool.destroyed`

Implements [Client.destroyed](Client.md#clientdestroyed)

### `Pool.stats`

Returns [`PoolStats`](PoolStats.md) instance for this pool.

## Instance Methods

### `Pool.close([callback])`

Implements [`Dispatcher.close([callback])`](Dispatcher.md#dispatcherclosecallback-promise).

### `Pool.destroy([error, callback])`

Implements [`Dispatcher.destroy([error, callback])`](Dispatcher.md#dispatcherdestroyerror-callback-promise).

### `Pool.dispatch(options, handler)`

Implements [`Dispatcher.dispatch(options, handler)`](Dispatcher.md#dispatcherdispatchoptions-handler).

### `Pool.request(options[, callback])`

See [`Dispatcher.request(options [, callback])`](Dispatcher.md#dispatcherrequestoptions-callback).

## Instance Events

### Event: `'connect'`

See [Dispatcher Event: `'connect'`](Dispatcher.md#event-connect).

### Event: `'disconnect'`

See [Dispatcher Event: `'disconnect'`](Dispatcher.md#event-disconnect).

### Event: `'drain'`

See [Dispatcher Event: `'drain'`](Dispatcher.md#event-drain).
