# Class: MockClient

Extends: `Client`

A mock client class that implements the same api as [MockPool](docs/api/MockPool.md).

## `new MockClient(origin, [options])`

Arguments:

* **origin** `string` - It should only include the **protocol, hostname, and port**.
* **options** `MockClientOptions` - It extends the `Client` options.

Returns: `MockClient`

### Parameter: `MockClientOptions`

Extends: `ClientOptions`

* **agent** `Agent` (optional) - Default: `new Agent([options])` - a custom agent encapsulated by the MockAgent.

### Example - Basic MockClient instantiation

We can use MockAgent to instantiate a MockClient ready to be used to intercept specified requests. It will not do anything until registered as the agent to use and any mock request are registered.

```js
'use strict'
const { MockAgent } = require('undici')

// Connections must be set to 1 to return a MockClient instance
const mockAgent = new MockAgent({ connections: 1 })

const mockClient = mockAgent.get('http://localhost:3000')
```

## Instance Methods

### `MockClient.intercept(options)`

Implements: [`MockPool.intercept(options)`](docs/api/MockPool.md#mockpoolinterceptoptions)

### `MockClient.close()`

Implements: [`MockPool.close()`](docs/api/MockPool.md#mockpoolclose)
