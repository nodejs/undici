# undici

[![Node CI](https://github.com/nodejs/undici/actions/workflows/nodejs.yml/badge.svg)](https://github.com/nodejs/undici/actions/workflows/nodejs.yml) [![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat)](http://standardjs.com/) [![npm version](https://badge.fury.io/js/undici.svg)](https://badge.fury.io/js/undici) [![codecov](https://codecov.io/gh/nodejs/undici/branch/main/graph/badge.svg?token=yZL6LtXkOA)](https://codecov.io/gh/nodejs/undici)

A HTTP/1.1 client, written from scratch for Node.js.

> Undici means eleven in Italian. 1.1 -> 11 -> Eleven -> Undici.
It is also a Stranger Things reference.

Have a question about using Undici? Open a [Q&A Discussion](https://github.com/nodejs/undici/discussions/new) or join our official OpenJS [Slack](https://openjs-foundation.slack.com/archives/C01QF9Q31QD) channel.

## Install

```
npm i undici
```

## Benchmarks

The benchmark is a simple `hello world` [example](benchmarks/benchmark.js) using a
number of unix sockets (connections) with a pipelining depth of 10 running on Node 16.
The benchmarks below have the [simd](https://github.com/WebAssembly/simd) feature enabled.

### Connections 1

| Tests               | Samples |        Result | Tolerance | Difference with slowest |
|---------------------|---------|---------------|-----------|-------------------------|
| http - no keepalive |      15 |  4.63 req/sec |  ± 2.77 % |                       - |
| http - keepalive    |      10 |  4.81 req/sec |  ± 2.16 % |                + 3.94 % |
| undici - stream     |      25 | 62.22 req/sec |  ± 2.67 % |             + 1244.58 % |
| undici - dispatch   |      15 | 64.33 req/sec |  ± 2.47 % |             + 1290.24 % |
| undici - request    |      15 | 66.08 req/sec |  ± 2.48 % |             + 1327.88 % |
| undici - pipeline   |      10 | 66.13 req/sec |  ± 1.39 % |             + 1329.08 % |

### Connections 50

| Tests               | Samples |           Result | Tolerance | Difference with slowest |
|---------------------|---------|------------------|-----------|-------------------------|
| http - no keepalive |      50 |  3546.49 req/sec |  ± 2.90 % |                       - |
| http - keepalive    |      15 |  5692.67 req/sec |  ± 2.48 % |               + 60.52 % |
| undici - pipeline   |      25 |  8478.71 req/sec |  ± 2.62 % |              + 139.07 % |
| undici - request    |      20 |  9766.66 req/sec |  ± 2.79 % |              + 175.39 % |
| undici - stream     |      15 | 10109.74 req/sec |  ± 2.94 % |              + 185.06 % |
| undici - dispatch   |      25 | 10949.73 req/sec |  ± 2.54 % |              + 208.75 % |

## Quick Start

```js
import { request } from 'undici'

const {
  statusCode,
  headers,
  trailers,
  body
} = await request('http://localhost:3000/foo')

console.log('response received', statusCode)
console.log('headers', headers)

for await (const data of body) {
  console.log('data', data)
}

console.log('trailers', trailers)
```

Using [the body mixin from the Fetch Standard](https://fetch.spec.whatwg.org/#body-mixin).

```js
import { request } from 'undici'

const {
  statusCode,
  headers,
  trailers,
  body
} = await request('http://localhost:3000/foo')

console.log('response received', statusCode)
console.log('headers', headers)
console.log('data', await body.json())
console.log('trailers', trailers)
```

## Common API Methods

This section documents our most commonly used API methods. Additional APIs are documented in their own files within the [docs](./docs/) folder and are accessible via the navigation list on the left side of the docs site.

### `undici.request([url, options]): Promise`

Arguments:

* **url** `string | URL | UrlObject`
* **options** [`RequestOptions`](./docs/api/Dispatcher.md#parameter-requestoptions)
  * **dispatcher** `Dispatcher` - Default: [getGlobalDispatcher](#undicigetglobaldispatcherdispatcher)
  * **method** `String` - Default: `PUT` if `options.body`, otherwise `GET`
  * **maxRedirections** `Integer` - Default: `0`

Returns a promise with the result of the `Dispatcher.request` method.

Calls `options.dispatcher.request(options)`.

See [Dispatcher.request](./docs/api/Dispatcher.md#dispatcherrequestoptions-callback) for more details.

### `undici.stream([url, options, ]factory): Promise`

Arguments:

* **url** `string | URL | UrlObject`
* **options** [`StreamOptions`](./docs/api/Dispatcher.md#parameter-streamoptions)
  * **dispatcher** `Dispatcher` - Default: [getGlobalDispatcher](#undicigetglobaldispatcherdispatcher)
  * **method** `String` - Default: `PUT` if `options.body`, otherwise `GET`
  * **maxRedirections** `Integer` - Default: `0`
* **factory** `Dispatcher.stream.factory`

Returns a promise with the result of the `Dispatcher.stream` method.

Calls `options.dispatcher.stream(options, factory)`.

See [Dispatcher.stream](docs/api/Dispatcher.md#dispatcherstream) for more details.

### `undici.pipeline([url, options, ]handler): Duplex`

Arguments:

* **url** `string | URL | UrlObject`
* **options** [`PipelineOptions`](docs/api/Dispatcher.md#parameter-pipelineoptions)
  * **dispatcher** `Dispatcher` - Default: [getGlobalDispatcher](#undicigetglobaldispatcherdispatcher)
  * **method** `String` - Default: `PUT` if `options.body`, otherwise `GET`
  * **maxRedirections** `Integer` - Default: `0`
* **handler** `Dispatcher.pipeline.handler`

Returns: `stream.Duplex`

Calls `options.dispatch.pipeline(options, handler)`.

See [Dispatcher.pipeline](docs/api/Dispatcher.md#dispatcherpipeline) for more details.

### `undici.connect([url, options]): Promise`

Starts two-way communications with the requested resource using [HTTP CONNECT](https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods/CONNECT).

Arguments:

* **url** `string | URL | UrlObject`
* **options** [`ConnectOptions`](docs/api/Dispatcher.md#parameter-connectoptions)
  * **dispatcher** `Dispatcher` - Default: [getGlobalDispatcher](#undicigetglobaldispatcherdispatcher)
  * **maxRedirections** `Integer` - Default: `0`
* **callback** `(err: Error | null, data: ConnectData | null) => void` (optional)

Returns a promise with the result of the `Dispatcher.connect` method.

Calls `options.dispatch.connect(options)`.

See [Dispatcher.connect](docs/api/Dispatcher.md#dispatcherconnect) for more details.

### `undici.fetch(input[, init]): Promise`

Implements [fetch](https://fetch.spec.whatwg.org/#fetch-method).

* https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/fetch
* https://fetch.spec.whatwg.org/#fetch-method

Only supported on Node 16+.

This is [experimental](https://nodejs.org/api/documentation.html#documentation_stability_index) and is not yet fully compliant with the Fetch Standard. We plan to ship breaking changes to this feature until it is out of experimental.

Basic usage example:

```js
    import {fetch} from 'undici';
    
    async function fetchJson() {
        const res = await fetch('https://example.com')
        const json = await res.json()
        console.log(json);
    }
```

#### `response.body`

Nodejs has two kinds of streams: [web streams](https://nodejs.org/dist/latest-v16.x/docs/api/webstreams.html) which follow the API of the WHATWG web standard found in browsers, and an older Node-specific [streams API](https://nodejs.org/api/stream.html). `response.body` returns a readable web stream. If you would prefer to work with a Node stream you can convert a web stream using `.fromWeb()`. 

```js
    import {fetch} from 'undici';
    import {Readable} from 'node:stream';

    async function fetchStream() {
        const response = await fetch('https://example.com')
        const readableWebStream = response.body;
        const readableNodeStream = Readable.fromWeb(readableWebStream);
    }
```

#### Specification Compliance

This section documents parts of the [Fetch Standard](https://fetch.spec.whatwg.org) which Undici does
not support or does not fully implement.

##### Garbage Collection

* https://fetch.spec.whatwg.org/#garbage-collection

The [Fetch Standard](https://fetch.spec.whatwg.org) allows users to skip consuming the response body by relying on
[garbage collection](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Memory_Management#garbage_collection) to release connection resources. Undici does the same. However,
garbage collection in Node is less aggressive and deterministic (due to the lack
of clear idle periods that browser have through the rendering refresh rate)
which means that leaving the release of connection resources to the garbage collector
can lead to excessive connection usage, reduced performance (due to less connection re-use),
and even stalls or deadlocks when running out of connections. Therefore, it is highly 
recommended to always either consume or cancel the response body.

```js
// Do
const headers = await fetch(url)
  .then(async res => {
    for await (const chunk of res) {
      // force consumption of body
    }
    return res.headers
  })

// Do not
const headers = await fetch(url)
  .then(res => res.headers)
```

### `undici.upgrade([url, options]): Promise`

Upgrade to a different protocol. See [MDN - HTTP - Protocol upgrade mechanism](https://developer.mozilla.org/en-US/docs/Web/HTTP/Protocol_upgrade_mechanism) for more details.

Arguments:

* **url** `string | URL | UrlObject`
* **options** [`UpgradeOptions`](docs/api/Dispatcher.md#parameter-upgradeoptions)
  * **dispatcher** `Dispatcher` - Default: [getGlobalDispatcher](#undicigetglobaldispatcherdispatcher)
  * **maxRedirections** `Integer` - Default: `0`
* **callback** `(error: Error | null, data: UpgradeData) => void` (optional)

Returns a promise with the result of the `Dispatcher.upgrade` method.

Calls `options.dispatcher.upgrade(options)`.

See [Dispatcher.upgrade](docs/api/Dispatcher.md#dispatcherupgradeoptions-callback) for more details.

### `undici.setGlobalDispatcher(dispatcher)`

* dispatcher `Dispatcher`

Sets the global dispatcher used by Common API Methods.

### `undici.getGlobalDispatcher()`

Gets the global dispatcher used by Common API Methods.

Returns: `Dispatcher`

### `UrlObject`

* **port** `string | number` (optional)
* **path** `string` (optional)
* **pathname** `string` (optional)
* **hostname** `string` (optional)
* **origin** `string` (optional)
* **protocol** `string` (optional)
* **search** `string` (optional)

## Specification Compliance

This section documents parts of the HTTP/1.1 specification which Undici does
not support or does not fully implement.

### Expect

Undici does not support the `Expect` request header field. The request
body is  always immediately sent and the `100 Continue` response will be
ignored.

Refs: https://tools.ietf.org/html/rfc7231#section-5.1.1

### Pipelining

Undici will only use pipelining if configured with a `pipelining` factor
greater than `1`.

Undici always assumes that connections are persistent and will immediately
pipeline requests, without checking whether the connection is persistent.
Hence, automatic fallback to HTTP/1.0 or HTTP/1.1 without pipelining is
not supported.

Undici will immediately pipeline when retrying requests afters a failed
connection. However, Undici will not retry the first remaining requests in
the prior pipeline and instead error the corresponding callback/promise/stream.

Undici will abort all running requests in the pipeline when any of them are
aborted.

* Refs: https://tools.ietf.org/html/rfc2616#section-8.1.2.2
* Refs: https://tools.ietf.org/html/rfc7230#section-6.3.2

## Collaborators

* [__Daniele Belardi__](https://github.com/dnlup), <https://www.npmjs.com/~dnlup>
* [__Ethan Arrowood__](https://github.com/ethan-arrowood), <https://www.npmjs.com/~ethan_arrowood>
* [__Matteo Collina__](https://github.com/mcollina), <https://www.npmjs.com/~matteo.collina>
* [__Robert Nagy__](https://github.com/ronag), <https://www.npmjs.com/~ronag>
* [__Szymon Marczak__](https://github.com/szmarczak), <https://www.npmjs.com/~szmarczak>
* [__Tomas Della Vedova__](https://github.com/delvedor), <https://www.npmjs.com/~delvedor>

### Releasers

* [__Ethan Arrowood__](https://github.com/ethan-arrowood), <https://www.npmjs.com/~ethan_arrowood>
* [__Matteo Collina__](https://github.com/mcollina), <https://www.npmjs.com/~matteo.collina>
* [__Robert Nagy__](https://github.com/ronag), <https://www.npmjs.com/~ronag>

## License

MIT
