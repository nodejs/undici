# Class: BalancedPool

Extends: `undici.Dispatcher`

A pool of [Pool](docs/api/Pool.md) instances connected to multiple upstreams.

Requests are not guaranteed to be dispatched in order of invocation.

## `new BalancedPool(upstreams [, options])`

Arguments:

* **upstreams** `URL | string | string[]` - It should only include the **protocol, hostname, and port**.
* **options** `PoolOptions` (optional)

### Parameter: `PoolOptions`

The `PoolOptions` are passed to each of the `Pool` instances being created.

See: [`PoolOptions`](docs/api/Pool.md#parameter-pooloptions)

## Instance Properties

### `BalancedPool.upstreams`

Returns an array of upstreams that were previously added.

### `BalancedPool.closed`

Implements [Client.closed](docs/api/Client.md#clientclosed)

### `BalancedPool.destroyed`

Implements [Client.destroyed](docs/api/Client.md#clientdestroyed)

## Instance Methods

### `BalancedPool.addUpstream(upstream)`

Add an upstream.

Arguments:

* **upstream** `string` - It should only include the **protocol, hostname, and port**.

### `BalancedPool.removeUpstream(upstream)`

Removes an upstream that was previously addded.

### `BalancedPool.close([callback])`

Implements [`Dispatcher.close([callback])`](docs/api/Dispatcher.md#clientclose-callback-).

### `BalancedPool.destroy([error, callback])`

Implements [`Dispatcher.destroy([error, callback])`](docs/api/Dispatcher.md#dispatcher-callback-).

### `BalancedPool.connect(options[, callback])`

See [`Dispatcher.connect(options[, callback])`](docs/api/Dispatcher.md#clientconnectoptions--callback).

### `BalancedPool.dispatch(options, handlers)`

Implements [`Dispatcher.dispatch(options, handlers)`](docs/api/Dispatcher.md#clientdispatchoptions-handlers).

### `BalancedPool.pipeline(options, handler)`

See [`Dispatcher.pipeline(options, handler)`](docs/api/Dispatcher.md#clientpipelineoptions-handler).

### `BalancedPool.request(options[, callback])`

See [`Dispatcher.request(options [, callback])`](docs/api/Dispatcher.md#clientrequestoptions--callback).

### `BalancedPool.stream(options, factory[, callback])`

See [`Dispatcher.stream(options, factory[, callback])`](docs/api/Dispatcher.md#clientstreamoptions-factory--callback).

### `BalancedPool.upgrade(options[, callback])`

See [`Dispatcher.upgrade(options[, callback])`](docs/api/Dispatcher.md#clientupgradeoptions-callback).

## Instance Events

### Event: `'connect'`

See [Dispatcher Event: `'connect'`](docs/api/Dispatcher.md#event-connect).

### Event: `'disconnect'`

See [Dispatcher Event: `'disconnect'`](docs/api/Dispatcher.md#event-connect).

### Event: `'drain'`

See [Dispatcher Event: `'drain'`](docs/api/Dispatcher.md#event-connect).
