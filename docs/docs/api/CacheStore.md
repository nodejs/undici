# Cache Store

A Cache Store is responsible for storing and retrieving cached responses.
It is also responsible for deciding which specific response to use based off of
a response's `Vary` header (if present).

## Pre-built Cache Stores

### `MemoryCacheStore`

The `MemoryCacheStore` stores the responses in-memory.

**Options**

- `maxEntries` - The maximum amount of responses to store. Default `Infinity`.
- `maxEntrySize` - The maximum size in bytes that a response's body can be. If a response's body is greater than or equal to this, the response will not be cached.

## Defining a Custom Cache Store

The store must implement the following functions:

### Getter: `isFull`

This tells the cache interceptor if the store is full or not. If this is true,
the cache interceptor will not attempt to cache the response.

### Function: `createReadStream`

Parameters:

* **req** `Dispatcher.RequestOptions` - Incoming request

Returns: `CacheStoreReadable | Promise<CacheStoreReadable | undefined> | undefined` - If the request is cached, a readable for the body is returned. Otherwise, `undefined` is returned.

### Function: `createWriteStream`

Parameters:

* **req** `Dispatcher.RequestOptions` - Incoming request
* **value** `CacheStoreValue` - Response to store

Returns: `CacheStoreWriteable | undefined` - If the store is full, return `undefined`. Otherwise, return a writable so that the cache interceptor can stream the body and trailers to the store.

## `CacheStoreValue`

This is an interface containing the majority of a response's data (minus the body).

### Property `statusCode`

`number` - The response's HTTP status code.

### Property `statusMessage`

`string` - The response's HTTP status message.

### Property `rawHeaders`

`(Buffer | Buffer[])[]` - The response's headers.

### Property `rawTrailers`

`string[] | undefined` - The response's trailers.

### Property `vary`

`Record<string, string> | undefined` - The headers defined by the response's `Vary` header
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

## `CacheStoreReadable`

This extends Node's [`Readable`](https://nodejs.org/api/stream.html#class-streamreadable)
and defines extra properties relevant to the cache interceptor.

### Getter: `value`

The response's [`CacheStoreValue`](#cachestorevalue)

## `CacheStoreWriteable`

This extends Node's [`Writable`](https://nodejs.org/api/stream.html#class-streamwritable)
and defines extra properties relevant to the cache interceptor.

### Setter: `rawTrailers`

If the response has trailers, the cache interceptor will pass them to the cache
interceptor through this method.
