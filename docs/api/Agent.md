# Agent

Extends: `undici.Dispatcher`

Agent allow dispatching requests against multiple different origins.

Requests are not guaranteed to be dispatched in order of invocation.

## `new undici.Agent([options])`

Arguments:

* **options** `AgentOptions` (optional)

Returns: `Agent`

### Parameter: `AgentOptions`

Extends: [`ClientOptions`](docs/api/Pool.md#parameter-pooloptions)

* **factory** `(origin: URL, opts: Object) => Dispatcher` - Default: `(origin, opts) => new Pool(origin, opts)`
* **maxRedirections** `Integer` - Default: `0`. The number of HTTP redirection to follow unless otherwise specified in `DispatchOptions`.

## Instance Properties

### `Agent.closed`

Implements [Client.closed](docs/api/Client.md#clientclosed)

### `Agent.destroyed`

Implements [Client.destroyed](docs/api/Client.md#clientdestroyed)

## Instance Methods

### `Agent.close([callback])`

Implements [`Dispatcher.close([callback])`](docs/api/Dispatcher.md#dispatcherclosecallback-promise).

### `Agent.destroy([error, callback])`

Implements [`Dispatcher.destroy([error, callback])`](docs/api/Dispatcher.md#dispatcherdestroyerror-callback-promise).

### `Agent.dispatch(options, handler: AgentDispatchOptions)`

Implements [`Dispatcher.dispatch(options, handler)`](docs/api/Dispatcher.md#dispatcherdispatchoptions-handler).

#### Parameter: `AgentDispatchOptions`

Extends: [`DispatchOptions``](docs/api/Dispatcher.md#parameter-dispatchoptions)

* **origin** `string | URL`
* **maxRedirections** `Integer`.

Implements [`Dispatcher.destroy([error, callback])`](docs/api/Dispatcher.md#dispatcherdestroyerror-callback-promise).

### `Agent.connect(options[, callback])`

See [`Dispatcher.connect(options[, callback])`](docs/api/Dispatcher.md#dispatcherconnectoptions-callback).

### `Agent.dispatch(options, handler)`

Implements [`Dispatcher.dispatch(options, handler)`](docs/api/Dispatcher.md#dispatcherdispatchoptions-handler).

### `Agent.pipeline(options, handler)`

See [`Dispatcher.pipeline(options, handler)`](docs/api/Dispatcher.md#dispatcherpipelineoptions-handler).

### `Agent.request(options[, callback])`

See [`Dispatcher.request(options [, callback])`](docs/api/Dispatcher.md#dispatcherrequestoptions-callback).

### `Agent.stream(options, factory[, callback])`

See [`Dispatcher.stream(options, factory[, callback])`](docs/api/Dispatcher.md#dispatcherstreamoptions-factory-callback).

### `Agent.upgrade(options[, callback])`

See [`Dispatcher.upgrade(options[, callback])`](docs/api/Dispatcher.md#dispatcherupgradeoptions-callback).
