# Class: Pool

Extends: `events.EventEmitter`

A pool of [Client](./Client.md) instances connected to the same upstream target. Implements the same api as [Client](./Client.md).

Requests are not guaranteed to be dispatched in order of invocation.

## `new Pool(url, [options])`

Arguments:

* **url** `URL | string` - It should only include the **protocol, hostname, and port**.
* **options** `PoolOptions` (optional)

### Parameter: `PoolOptions`

Extends: [`ClientOptions`](./Client.md#parameter-clientoptions)

* **connections** `number | null` (optional) - Default: `null` - The number of `Client` instances to create.

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

### `Pool.running`

Implements [Client.running](./Client.md#clientrunning)

### `Pool.size`

Implements [Client.size](./Client.md#clientsize)

### `Pool.url`

Implements [Client.url](./Client.md#clienturl)

## Instance Methods

### `Pool.close(callback)`

### `Pool.connect(options, handler)`

### `Pool.destroy(error, callback)`

### `Pool.dispatch(options, handler)`

### `Pool.pipeline(options, handler)`

### `Pool.request(options, handler)`

### `Pool.stream(options, handler)`

### `Pool.upgrade(options, handler)`

## Instance Events

### Event: `'connect'`

### Event: `'disconnect'`

### Event: `'drain'`