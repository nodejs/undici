# Class: Pool

Extends: `events.EventEmitter`

A pool of [Client](Client.md) instances connected to the same upstream target. Implements the same api as [Client](./Client.md).

Requests are not guaranteed to be dispatched in order of invocation.

## `new Pool(url, [options])`

Arguments:

* **url** `URL | string` - It should only include the **protocol, hostname, and port**.
* **options** `PoolOptions` (optional)

### Parameter: `PoolOptions`

Extends: [`ClientOptions`](./Client.md#parameter-clientoptions)

* **connections** `number | null` (optional) - Default: `null` - The number of `Client` instances to create. When set to `null`, the `Pool` instance will create an unlimited amount of `Client` instances.

## Instance Properties

### `Pool.busy`

Implements [Client.busy](./Client.md#clientbusy)

### `Pool.closed`

Implements [Client.closed](./Client.md#clientclosed)

### `Pool.connected`

Implements [Client.connected](./Client.md#clientconnected)

### `Pool.destroyed`

Implements [Client.destroyed](./Client.md#clientdestroyed)

### `Pool.pending`

Implements [Client.pending](./Client.md#clientpending)

<!-- TODO: https://github.com/nodejs/undici/issues/561 
### `Pool.pipelining`

Implements [Client.pipelining](./Client.md#clientpipelining) -->

### `Pool.running`

Implements [Client.running](./Client.md#clientrunning)

### `Pool.size`

Implements [Client.size](./Client.md#clientsize)

### `Pool.url`

Implements [Client.url](./Client.md#clienturl)

## Instance Methods

### `Pool.close(callback)`

Implements [`Client.close([ callback ])`](./Client.md#clientclose-callback-)

### `Pool.connect(options [, callback])`

Implements [`Client.connect(options [, callback])`](./Client.md#clientconnectoptions--callback)

### `Pool.destroy(error)`

Implements [`Client.destroy(error)`](./Client.md#clientdestroyerror)

### `Pool.dispatch(options, handlers)`

Implements [`Client.dispatch(options, handlers)`](./Client.md#clientdispatchoptions-handlers)

### `Pool.pipeline(options, handler)`

Implements [`Client.pipeline(options, handler)`](./Client.md#clientpipelineoptions-handler)

### `Pool.request(options [, callback])`

Implements [`Client.request(options [, callback])`](./Client.md#clientrequestoptions--callback)

### `Pool.stream(options, factory, [, callback])`

Implements [`Client.stream(options, factory [, callback])`](./Client.md#clientstreamoptions-factory--callback)

### `Pool.upgrade(options [, callback])`

Implements [`Client.upgrade(options[, callback])`](./Client.md#clientupgradeoptions-callback)

## Instance Events

### Event: `'connect'`

Implements [Client Event: `'connect'`](./Client.md#event-connect)

### Event: `'disconnect'`

Implements [Client Event: `'disconnect'`](./Client.md#event-connect)

### Event: `'drain'`

Implements [Client Event: `'drain'`](./Client.md#event-connect)
