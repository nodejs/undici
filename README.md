# undici

![Node CI](https://github.com/mcollina/undici/workflows/Node%20CI/badge.svg)  [![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat)](http://standardjs.com/)

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

Machine: 2.7 GHz Quad-Core Intel Core i7<br/>
Configuration: Node v14.2, HTTP/1.1 without TLS, 100 connections

```
http - keepalive - pipe x 6,545 ops/sec ±12.47% (64 runs sampled)
undici - pipeline - pipe x 9,560 ops/sec ±3.68% (77 runs sampled)
undici - request - pipe x 9,797 ops/sec ±6.80% (77 runs sampled)
undici - stream - pipe x 11,599 ops/sec ±0.89% (78 runs sampled)
```

The benchmark is a simple `hello world` [example](benchmarks/index.js).

## API

<a name='client'></a>
### `new undici.Client(url, opts)`

A basic HTTP/1.1 client, mapped on top a single TCP/TLS connection.
Keepalive is enabled by default, and it cannot be turned off.

The `url` will be used to extract the protocol and the domain/IP
address. The path is discarded.

Options:

- `socketTimeout`, the timeout after which a socket will time out, in
  milliseconds. Monitors time between activity on a connected socket.
  Use `0` to disable it entirely. Default: `30e3` milliseconds (30s).

- `requestTimeout`, the timeout after which a request will time out, in
  milliseconds. Monitors time between request being enqueued and receiving
  a response. Use `0` to disable it entirely.
  Default: `30e3` milliseconds (30s).

- `maxAbortedPayload`, the maximum number of bytes read after which an
  aborted response will close the connection. Closing the connection
  will error other inflight requests in the pipeline.
  Default: `1e6` bytes (1MiB).

- `pipelining`, the amount of concurrent requests to be sent over the
  single TCP/TLS connection according to
  [RFC7230](https://tools.ietf.org/html/rfc7230#section-6.3.2).
  Default: `1`.

- `tls`, an options object which in the case of `https` will be passed to
  [`tls.connect`](https://nodejs.org/api/tls.html#tls_tls_connect_options_callback).

<a name='request'></a>
#### `client.request(opts, callback(err, data))`

Performs an HTTP request.

Options:

* `path`
* `method`
* `body`, it can be a `String`, a `Buffer`, `Uint8Array` or a `stream.Readable`.
* `headers`, an object with header-value pairs.
* `signal`, either an `AbortController` or an `EventEmitter`.
* `requestTimeout`, the timeout after which a request will time out, in
  milliseconds. Monitors time between request being enqueued and receiving
  a response. Use `0` to disable it entirely.
  Default: `30e3` milliseconds (30s).
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

`headers` is an object where all keys have been lowercased.

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

Non-idempotent requests will not be pipelined in order
to avoid indirect failures.

Idempotent requests will be automatically retried if
they fail due to indirect failure from the request
at the head of the pipeline. This does not apply to
idempotent requests with a stream request body.

##### Aborting a request

A request can may be aborted using either an `AbortController` or an `EventEmitter`.
To use `AbortController`, you will need to `npm i abort-controller`.

```js
const { AbortController } = require('abort-controller')
const { Client } = require('undici')

const client = new Client'http://localhost:3000')
const abortController = new AbortController()

client.request({
  path: '/',
  method: 'GET',
  signal: abortController.signal
}, function (err, data) {
  console.log(err) // RequestAbortedError
  client.close()
})

abortController.abort()
```

Alternatively, any `EventEmitter` that emits an `'abort'` event may be used as an abort controller:

```js
const EventEmitter = require('events')
const { Client } = require('undici')


const client = new Client'http://localhost:3000')
const ee = new EventEmitter()

client.request({
  path: '/',
  method: 'GET',
  signal: ee
}, function (err, data) {
  console.log(err) // RequestAbortedError
  client.close()
})

ee.emit('abort')
```

Destroying the request or response body will have the same effect.

<a name='stream'></a>
#### `client.stream(opts, factory(data), callback(err))`

A faster version of [`request`][request].

Unlike [`request`][request] this method expects `factory`
to return a [`Writable`](https://nodejs.org/api/stream.html#stream_class_stream_writable) which the response will be
written to. This improves performance by avoiding
creating an intermediate [`Readable`](https://nodejs.org/api/stream.html#stream_readable_streams) when the user
expects to directly pipe the response body to a
[`Writable`](https://nodejs.org/api/stream.html#stream_class_stream_writable).

Options:

* ... same as [`client.request(opts, callback)`][request].
* `opaque`, passed as `opaque` to `factory`. Used
  to avoid creating a closure.

The `data` parameter in `factory` is defined as follow:

* `statusCode`
* `headers`
* `opaque`

`headers` is an object where all keys have been lowercased.

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

For easy use with [`stream.pipeline`](https://nodejs.org/api/stream.html#stream_stream_pipeline_source_transforms_destination_callback).

Options:

* ... same as [`client.request(opts, callback)`][request].
* `opaque`, passed as `opaque` to `handler`. Used
  to avoid creating a closure.

The `data` parameter in `handler` is defined as follow:

* `statusCode`
* `headers`
* `opaque`
* `body`, a `stream.Readable` with the body to read. A user **must**
  either fully consume or destroy the body unless there is an error, or no further requests
  will be processed.

`handler` should return a [`Writable`](https://nodejs.org/api/stream.html#stream_class_stream_writable) to which the response will be
written to. Usually it should just return the `body` argument unless
some kind of transformation needs to be performed based on e.g.
`headers` or `statusCode`.

`headers` is an object where all keys have been lowercased.

The `handler` should validate the response and save any
required state. If there is an error it should be thrown.

Returns a `Duplex` which writes to the request and reads from
the response.

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

Destroy the client abruptly with the given `err`. All the pending and running
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

Number of pending and running requests.

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

* `'connect'`, emitted when a socket has been created and
  connected. The client will connect once `client.size > 0`.

* `'disconnect'`, emitted when socket has disconnected. The
  first argument of the event is the error which caused the
  socket to disconnect. The client will reconnect if or once 
  `client.size > 0`.

<a name='pool'></a>
### `new undici.Pool(url, opts)`

A pool of [`Client`][] connected to the same upstream target.

Options:

* ... same as [`Client`][].
* `connections`, the number of clients to create.
  Default `100`.

#### `pool.request(opts, callback)`

Calls [`client.request(opts, callback)`][request] on one of the clients.

#### `pool.stream(opts, factory, callback)`

Calls [`client.stream(opts, factory, callback)`][stream] on one of the clients.

#### `pool.pipeline(opts, handler)`

Calls [`client.pipeline(opts, handler)`][pipeline] on one of the clients.

#### `pool.close([callback])`

Calls [`client.close(callback)`](#close) on all the clients.

#### `pool.destroy([err][, callback])`

Calls [`client.destroy(err, callback)`](#destroy) on all the clients.

<a name='errors'></a>
### `undici.errors`

Undici exposes a variety of error objects that you can use to enhance your error handling.
You can find all the error objects inside the `errors` key.

```js
const { errors } = require('undici')
```

| Error                     | Error Codes                       | Description                                    |
| --------------------------|-----------------------------------|------------------------------------------------|
| `InvalidArgumentError`    |  `UND_ERR_INVALID_ARG`            | passed an invalid argument.                    |
| `InvalidReturnValueError` |  `UND_ERR_INVALID_RETURN_VALUE`   | returned an invalid value.                     |
| `SocketTimeoutError`      |  `UND_ERR_SOCKET_TIMEOUT`         | a socket exceeds the `socketTimeout` option.   |
| `RequestTimeoutError`     |  `UND_ERR_REQUEST_TIMEOUT`        | a request exceeds the `requestTimeout` option. |
| `RequestAbortedError`     |  `UND_ERR_ABORTED`                | the request has been aborted by the user       |
| `ClientDestroyedError`    |  `UND_ERR_DESTROYED`              | trying to use a destroyed client.              |
| `ClientClosedError`       |  `UND_ERR_CLOSED`                 | trying to use a closed client.                 |
| `SocketError`             |  `UND_ERR_SOCKET`                 | there is an error with the socket.             |
| `NotSupportedError`       |  `UND_ERR_NOT_SUPPORTED`          | encountered unsupported functionality.         |

## Specification Compliance

This section documents parts of the HTTP/1.1 specification which Undici does 
not support or does not fully implement.

### Informational Responses

Undici does not support 1xx informational responses and will either
ignore or error them.

#### Expect

Undici does not support the `Expect` request header field. The request
body is  always immediately sent and the `100 Continue` response will be 
ignored.

Refs: https://tools.ietf.org/html/rfc7231#section-5.1.1

#### Upgrade

Undici does not support the the `Upgrade` request header field. A 
`101 Switching Protocols` response will cause an `UND_ERR_NOT_SUPPORTED` error.

Refs: https://tools.ietf.org/html/rfc7230#section-6.7

#### Hints

Undici does not support early hints. A `103 Early Hint` response will
be ignored.

Refs: https://tools.ietf.org/html/rfc8297

### Trailer

Undici does not support the the `Trailer` response header field. Any response
trailer headers will be ignored.

Refs: https://tools.ietf.org/html/rfc7230#section-4.4

### Pipelining

Uncidi will only use pipelining if configured with a `pipelining` factor 
greater than `1`.

Undici always assumes that connections are persistent and will immediatly 
pipeline requests, without checking whether the connection is persistent.
Hence, automatic fallback to HTTP/1.0 or HTTP/1.1 without pipelining is 
not supported.

Undici will immediately pipeline when retrying requests afters a failed
connection. However, Undici will not retry the first remaining requests in
the prior pipeline and instead error the corresponding callback/promise/stream.

Refs: https://tools.ietf.org/html/rfc2616#section-8.1.2.2<br/>
Refs: https://tools.ietf.org/html/rfc7230#section-6.3.2

## Collaborators

* [__Robert Nagy__](https://github.com/ronag), <https://www.npmjs.com/~ronag>

## License

MIT

[`Client`]: #client
[request]: #request
[stream]: #stream
[pipeline]: #pipeline
