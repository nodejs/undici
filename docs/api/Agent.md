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

Implements [`Dispatcher.close([callback])`](docs/api/Dispatcher.md#clientclose-callback-).

### `Agent.destroy([error, callback])`

Implements [`Dispatcher.destroy([error, callback])`](docs/api/Dispatcher.md#dispatcher-callback-).

### `Agent.dispatch(options, handlers: AgentDispatchOptions)`

Implements [`Dispatcher.dispatch(options, handlers)`](docs/api/Dispatcher.md#clientdispatchoptions-handlers).

#### Parameter: `AgentDispatchOptions`

Extends: [`DispatchOptions``](docs/api/Dispatcher.md#parameter-dispatchoptions)

* **origin** `string | URL`
* **maxRedirections** `Integer`.

Implements [`Dispatcher.destroy([error, callback])`](docs/api/Dispatcher.md#dispatcher-callback-).

### `Agent.connect(options[, callback])`

See [`Dispatcher.connect(options[, callback])`](docs/api/Dispatcher.md#clientconnectoptions--callback).

### `Agent.dispatch(options, handlers)`

Implements [`Dispatcher.dispatch(options, handlers)`](docs/api/Dispatcher.md#clientdispatchoptions-handlers).

### `Agent.pipeline(options, handler)`

See [`Dispatcher.pipeline(options, handler)`](docs/api/Dispatcher.md#clientpipelineoptions-handler).

### `Agent.request(options[, callback])`

See [`Dispatcher.request(options [, callback])`](docs/api/Dispatcher.md#clientrequestoptions--callback).

### `Agent.stream(options, factory[, callback])`

See [`Dispatcher.stream(options, factory[, callback])`](docs/api/Dispatcher.md#clientstreamoptions-factory--callback).

### `Agent.upgrade(options[, callback])`

See [`Dispatcher.upgrade(options[, callback])`](docs/api/Dispatcher.md#clientupgradeoptions-callback).
