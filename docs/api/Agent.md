# Agent

## `new undici.Agent(opts)`

* opts `AgentOptions` - options passed through to Pool constructor

Returns: `Agent`

Returns a new Agent instance for use with pool based requests or the following top-level methods `request`, `pipeline`, and `stream`.

### Parameter: `AgentOptions`

Extends: [`PoolOptions`](docs/api/Pool.md#parameter-pooloptions)

* factory `(url: string, options?: Client.Options): Pool` (optional) - A factory which returns the pool to use for the request.

#### Example - Use `factory` to use a RedirectPool which follow redirects

```js
'use strict'
const { createServer } = require('http')
const { Agent, request, RedirectPool } = require('.')

const server = createServer((request, response) => {
  response.setHeader('Connection', `close`)

  if (request.url === '/') {
    response.statusCode = 301
    response.setHeader('Location', `http://localhost:${server.address().port}/end`)
    response.end('')
    return
  }

  response.end('undici')
})

server.listen(() => {
  request(
    `http://localhost:${server.address().port}`,
    {
      agent: new Agent({
        /*
          Optionally, a redirectPoolFactory is also exported by undici:

          factory: redirectPoolFactory
        */
        factory(origin, opts) {
          return new RedirectPool(origin, opts)
        }
      })
    },
    (error, {body}) => {
      body.setEncoding('utf8')
      body.on('data', console.log) // This will output 'undici'
      body.on('end', server.close.bind(server))
    }
  )
})
```

## `agent.get(origin): Pool`

* origin `string` - A pool origin to be retrieved from the Agent.

This method retrieves Pool instances from the Agent. If the pool does not exist it is automatically added. You do not need to manually close these pools as they are automatically removed using a WeakCache based on WeakRef and FinalizationRegistry.
The following methods `request`, `pipeline`, and `stream` utilize this feature.

## `agent.close(): Promise`

Returns a `Promise.all` operation closing all of the pool instances in the Agent instance. This calls `pool.close` under the hood.

## `agent.destroy(): Promise`

Returns a `Promise.all` operation destroying all of the pool instances in the Agent instance. This calls `pool.destroy` under the hood.

## `undici.setGlobalAgent(agent)`

* agent `Agent`

Sets the global agent used by `request`, `pipeline`, and `stream` methods.
The default global agent creates `undici.Pool`s with no max number of
connections.

The agent must only **implement** the `Agent` API; not necessary extend from it.

## `undici.request(url[, opts]): Promise`

* url `string | URL | object`
* opts `{ agent: Agent } & client.request.opts`

`url` may contain path. `opts` may not contain path. `opts.method` is `GET` by default.
Calls `pool.request(opts)` on the pool returned from either the globalAgent (see [setGlobalAgent](#undicisetglobalagentagent)) or the agent passed to the `opts` argument.

Returns a promise with the result of the `request` method.

## `undici.stream(url, opts, factory): Promise`

* url `string | URL | object`
* opts `{ agent: Agent } & client.stream.opts`
* factory `client.stream.factory`

`url` may contain path. `opts` may not contain path.
See [client.stream](docs/api/Client.md#clientstreamoptions-factory--callback) for details on the `opts` and `factory` arguments.
Calls `pool.stream(opts, factory)` on the pool returned from either the globalAgent (see [setGlobalAgent](#undicisetglobalagentagent)) or the agent passed to the `opts` argument.
Result is returned in the factory function. See [client.stream](docs/api/Client.md#clientstreamoptions-factory--callback) for more details.

## `undici.pipeline(url, opts, handler): Duplex`

* url `string | URL | object`
* opts `{ agent: Agent } & client.pipeline.opts`
* handler `client.pipeline.handler`

`url` may contain path. `opts` may not contain path.

See [client.pipeline](docs/api/Client.md#clientpipelining) for details on the `opts` and `handler` arguments.

Calls `pool.pipeline(opts, factory)` on the pool returned from either the globalAgent (see [setGlobalAgent](#undicisetglobalagentagent)) or the agent passed to the `opts` argument.

See [client.pipeline](docs/api/Client.md#clientpipelining) for more details.
