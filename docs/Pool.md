# Class: Pool

Extends: `events.EventEmitter`

A pool of [Client](./Client.md) instances connected to the same upstream target. Implements the same api as [Client](./Client.md).

Requests are not guaranteed to be dispatched in order of invocation.

## `new Pool(options)`

## Instance Properties

### `Pool.busy`

### `Pool.closed`

### `Pool.connected`

### `Pool.destroyed`

### `Pool.pending`

### `Pool.running`

### `Pool.size`

### `Pool.url`

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