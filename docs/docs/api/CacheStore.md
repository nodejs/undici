# Cache Store

A Cache Store is responsible for storing and retrieving cached responses.
It is also responsible for deciding which specific response to use based off of
a response's `Vary` header (if present). It is expected to be compliant with
[RFC-9111](https://www.rfc-editor.org/rfc/rfc9111.html).

## Pre-built Cache Stores

### `MemoryCacheStore`

The `MemoryCacheStore` stores the responses in-memory.

**Options**

- `maxEntries` - The maximum amount of responses to store. Default `Infinity`.
- `maxEntrySize` - The maximum size in bytes that a response's body can be. If a response's body is greater than or equal to this, the response will not be cached.

## Defining a Custom Cache Store

The store must implement the following functions:

### Getter: `isFull`

Optional. This tells the cache interceptor if the store is full or not. If this is true,
the cache interceptor will not attempt to cache the response.

### Function: `get`

Parameters:

* **req** `Dispatcher.RequestOptions` - Incoming request

Returns: `GetResult | Promise<GetResult | undefined> | undefined` - If the request is cached, the cached response is returned. If the request's method is anything other than HEAD, the response is also returned.
If the request isn't cached, `undefined` is returned.

Response properties:

* **response** `CachedResponse` - The cached response data.
* **body** `Readable | undefined` - The response's body.

### Function: `createWriteStream`

Parameters:

* **req** `Dispatcher.RequestOptions` - Incoming request
* **value** `CachedResponse` - Response to store

Returns: `Writable | undefined` - If the store is full, return `undefined`. Otherwise, return a writable so that the cache interceptor can stream the body and trailers to the store.

## `CachedResponse`

This is an interface containing the majority of a response's data (minus the body).

### Property `statusCode`

`number` - The response's HTTP status code.

### Property `statusMessage`

`string` - The response's HTTP status message.

### Property `rawHeaders`

`Buffer[]` - The response's headers.

### Property `vary`

`Record<string, string | string[]> | undefined` - The headers defined by the response's `Vary` header
and their respective values for later comparison

For example, for a response like
```
Vary: content-encoding, accepts
content-encoding: utf8
accepts: application/json
```

This would be
```js
{
  'content-encoding': 'utf8',
  accepts: 'application/json'
}
```

### Property `cachedAt`

`number` - Time in millis that this value was cached.

### Property `staleAt`

`number` - Time in millis that this value is considered stale.

### Property `deleteAt`

`number` - Time in millis that this value is to be deleted from the cache. This
is either the same sa staleAt or the `max-stale` caching directive.

The store must not return a response after the time defined in this property.
