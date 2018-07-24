# undici

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

## API

### new undici.Client(url, opts)

A basic HTTP/1.1 client, mapped on top a single TCP/TLS connection.
Keepalive is enabled by default, and it cannot be turned off.

The `url` will be used to extract the protocol and the domain/IP
address. The path is discarded.

Options:

- `timeout`, the timeout after which a request will time out, in
  milliseconds. Default:
  `30000` milliseconds.

- `pipelining`, the amount of concurrent requests to be sent over the
  single TCP/TLS connection according to
  [RFC7230](https://tools.ietf.org/html/rfc7230#section-6.3.2). Default: `1`.

#### `client.request(opts, cb(err, data))`

Performs an HTTP request.

Options:

* `path`
* `method`
* `body`, it can be a `String`, a `Buffer` or a `stream.Readable`.
* `headers`, an object with header-value pairs.

The `data` parameter in the callback is defined as follow:

* `statusCode`
* `headers`
* `body`, a  `stream.Readable` with the body to read. A user **must**
  call `data.body.resume()`

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
#### `client.pipelining`

Property to set the pipelining factor.

#### `client.full`

True if the number of requests waiting to be sent is greater
than the pipelining factor. Keeping a client full ensures that once the
inflight set of requests finishes there is a full batch ready to go.

#### `client.close()`

Close the client as soon as all the enqueued requests are completed

#### `client.destroy(err)`

Destroy the client abruptly with the given `err`. All the current and
enqueued requests will error.

#### Events

### undici.Pool

#### `pool.request`

#### `pool.close`

#### Events

## License

MIT
