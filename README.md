# undici

[![Build
Status](https://travis-ci.com/mcollina/undici.svg?branch=master)](https://travis-ci.com/mcollina/undici)

An HTTP/1.1 client, written from scratch for Node.js.

> Undici means eleven in Italian. 1.1 -> 11 -> Eleven -> Undici.
It is also a Stranger Things reference.

<!--
Picture of Eleven
-->

## Install

```
npm i undici
```

## Benchmarks

Machine: 2.7 GHz Quad-Core Intel Core i7
Configuration: Node v14.2, HTTP/1.1 without TLS, 100 connections

```
http - keepalive - pipe x 5,120 ops/sec ±10.80% (65 runs sampled)
undici - pipeline - pipe x 6,227 ops/sec ±11.44% (71 runs sampled)
undici - request - pipe x 8,685 ops/sec ±8.96% (67 runs sampled)
undici - stream - pipe x 11,453 ops/sec ±3.69% (79 runs sampled)
```

The benchmark is a simple `hello world` [example](benchmarks/index.js).

## API

<a name='client'></a>
### new undici.Client(url, opts)

A basic HTTP/1.1 client, mapped on top a single TCP/TLS connection.
Keepalive is enabled by default, and it cannot be turned off.

The `url` will be used to extract the protocol and the domain/IP
address. The path is discarded.

Options:

- `timeout`, the timeout after which a request will time out, in
  milliseconds.
  Default: `30e3` milliseconds (30s).

- `maxAbortedPayload`, the maximum number of bytes read after which an
  aborted response will close the connection. Closing the connection
  will error other inflight requests in the pipeline.
  Default: `1e6` bytes (1MiB).

- `pipelining`, the amount of concurrent requests to be sent over the
  single TCP/TLS connection according to
  [RFC7230](https://tools.ietf.org/html/rfc7230#section-6.3.2). 
  Default: `1`.

<a name='request'></a>
#### `client.request(opts, callback(err, data))`

Performs an HTTP request.

Options:

* `path`
* `method`
* `body`, it can be a `String`, a `Buffer`, `Uint8Array` or a `stream.Readable`.
* `headers`, an object with header-value pairs.
* `idempotent`, whether the requests can be safely retried or not.
  If `false` the request won't be sent until all preceeding
  requests in the pipeline has completed.
  Default: `true` if `method` is `HEAD` or `GET`.

Headers are represented by an object like this:

```js
{
  'content-length': '123',
  'content-type': 'text/plain',
  connection: 'keep-alive',
  host: 'mysite.com',
  accept: '*/*'
}
```
Keys are lowercased. Values are not modified.
If you don't specify a `host` header, it will be derived from the `url` of the client instance.

The `data` parameter in `callback` is defined as follow:

* `statusCode`
* `headers`
* `body`, a `stream.Readable` with the body to read. A user **must**
  either fully consume or destroy the body unless there is an error, or no further requests
  will be processed.

Returns a promise if no callback is provided.

Example:

```js
const { Client } = require('undici')
const client = new Client(`http://localhost:3000`)

client.request({
  path: '/',
  method: 'GET'
}, function (err, data) {
  if (err) {
    // handle this in some way!
    return
  }
  const {
    statusCode,
    headers,
    body
  } = data


  console.log('response received', statusCode)
  console.log('headers', headers)

  body.setEncoding('utf8')
  body.on('data', console.log)

  client.close()
})
```

Abortion is supported by destroying the request or
response body.

```js
// Abort while sending request.
const body = new stream.Passthrough()
const promise = client.request({
  path: '/',
  method: 'POST',
  body
})
body.destroy()
const { statusCode, headers } = await promise
```

```js
// Abort while reading response.
const { statusCode, headers, body } = await client.request({
  path: '/',
  method: 'GET'
})
body.destroy()
```

Promises and async await are supported as well!
```js
const { statusCode, headers, body } = await client.request({
  path: '/',
  method: 'GET'
})
```

Non-idempotent requests will not be pipelined in order 
to avoid indirect failures.

Idempotent requests will be automatically retried if
they fail due to indirect failure from the request
at the head of the pipeline. This does not apply to
idempotent requests with a stream request body.

<a name='stream'></a>
#### `client.stream(opts, factory(data), callback(err))`

A faster version of `request`.

Unlike `request` this method expects `factory`
to return a `Writable` which the response will be
written to. This improves performance by avoiding
creating an intermediate `Readable` when the user
expects to directly pipe the response body to a
`Writable`.

Options:

* ... same as `request`.
* `opaque`, passed as `opaque` to `factory`. Used
  to avoid creating a closure.

The `data` parameter in `factory` is defined as follow:

* `statusCode`
* `headers`
* `opaque`

Returns a promise if no callback is provided.

```js
const { Client } = require('undici')
const client = new Client(`http://localhost:3000`)
const fs = require('fs')

client.stream({
  path: '/',
  method: 'GET',
  opaque: filename
}, ({ statusCode, headers, opaque: filename }) => {
  console.log('response received', statusCode)
  console.log('headers', headers)
  return fs.createWriteStream(filename)
}, (err) => {
  if (err) {
    console.error('failure', err)
  } else {
    console.log('success')
  }
})
```

`opaque` makes it possible to avoid creating a closure
for the `factory` method:

```js
function (req, res) {
   return client.stream({ ...opts, opaque: res }, proxy)
}
```

Instead of:

```js
function (req, res) {
   return client.stream(opts, (data) => {
     // Creates closure to capture `res`.
     proxy({ ...data, opaque: res })
   }
}
```

<a name='pipeline'></a>
#### `client.pipeline(opts, handler(data))`

For easy use with `stream.pipeline`.

Options:

* ... same as `request`.

The `data` parameter in `handler` is defined as follow:

* `statusCode`
* `headers`
* `body`, a `stream.Readable` with the body to read. A user **must**
  either fully consume or destroy the body unless there is an error, or no further requests
  will be processed.

Unlike `request` this method expects `handler`
to return a `Writable` which the response will be
written to. Usually it should just return the `body`
argument unless some kind of transformation needs
to be performed based on e.g. `headers` or `statusCode`.

The `handler` should validate the response and save any
required state. If there is an error it should be thrown.

```js
const { Client } = require('undici')
const client = new Client(`http://localhost:3000`)
const fs = require('fs')
const stream = require('stream')

stream.pipeline(
  fs.createReadStream('source.raw'),
  client.pipeline({
    path: '/',
    method: 'PUT',
  }, ({ statusCode, headers, body }) => {
    if (statusCode !== 201) {
      throw new Error('invalid response')
    }

    if (isZipped(headers)) {
      return pipeline(body, unzip(), () => {})
    }

    return body
  }),
  fs.createReadStream('response.raw'),
  (err) => {
    if (err) {
      console.error('failed')
    } else {
      console.log('succeeded')
    }
  }
)
```

<a name='close'></a>
#### `client.close([callback])`

Closes the client and gracefully waits fo enqueued requests to
complete before invoking the callback.

Returns a promise if no callback is provided.

<a name='destroy'></a>
#### `client.destroy([err][, callback])`

Destroy the client abruptly with the given `err`. All the current and enqueued
requests will be aborted and error. Waits until socket is closed before 
invoking the callback.

Returns a promise if no callback is provided.

#### `client.pipelining`

Property to get and set the pipelining factor.

#### `client.pending`

Number of queued requests.

#### `client.running`

Number of inflight requests.

#### `client.size`

Number of queued and inflight requests.

#### `client.connected`

True if the client has an active connection. The client will lazily
create a connection when it receives a request and will destroy it
if there is no activity for the duration of the `timeout` value.

#### `client.full`

True if `client.size` is greater than the `client.pipelining` factor. 
Keeping a client full ensures that once a inflight requests finishes 
the the pipeline will schedule new one and keep the pipeline saturated.

#### `client.closed`

True after `client.close()` has been called.

#### `client.destroyed`

True after `client.destroyed()` has been called or `client.close()` has been
called and the client shutdown has completed.

#### Events

* `'drain'`, emitted when `client.size` decreases to `0` and the client
  is not closed or destroyed.

* `'connect'`, emitted when a socket has been created and 
  connected. The client will connect once `client.size > 0`.

* `'reconnect'`, emitted when socket has disconnected. The 
  client will reconnect if or once `client.size > 0`.

### undici.Pool

A pool of [`Client`][] connected to the same upstream target.
A pool creates a fixed number of [`Client`][]

Options:

* `connections`, the number of clients to create. 
  Default `100`.
* `pipelining`, the pipelining factor. 
  Default `1`.
* `timeout`, the timeout for each request. 
  Default `30e3` milliseconds (30s).

#### `pool.request(req, callback)`

Calls [`client.request(req, callback)`][request] on one of the clients.

#### `pool.stream(req, factory, callback)`

Calls [`client.stream(req, factory, callback)`][stream] on one of the clients.

#### `pool.close([callback])`

Calls [`client.close(callback)`](#close) on all the clients.

#### `pool.destroy([err][, callback])`

Calls [`client.destroy(err, callback)`](#destroy) on all the clients.

## License

MIT

[`Client`]: #client
[request]: #request
