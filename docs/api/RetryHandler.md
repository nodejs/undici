# Class: RetryHandler

Extends: `undici.DispatcherHandlers`

A handler class that implements the retry logic for a request.

## `new RetryHandler(dispatchOptions, retryHandlers, [retryOptions])`

Arguments:

- **dispatchOptions** `Dispatch.DispatchOptions` (required) - It extends `Dispatcher.DispatchOptions`
- **retryHandlers** `RetryHandlers` (required) - Object containing the `dispatch` to be used on every retry, and `handler` for handling the `dispatch` lifecycle.
- **retryOptions** `RetryOptions` (optional) - Object containing the `retries` and `methods` to be used on every retry.

Returns: `retryHandler`

### Parameter: `Dispatch.DispatchOptions`

Extends: [`Dispatch.DispatchOptions`](Dispatcher.md#parameter-dispatchoptions)

### Parameter `RetryHandlers`

- **dispatch** `(options: Dispatch.DispatchOptions, handlers: Dispatch.DispatchHandlers) => Promise<Dispatch.DispatchResponse>` (required) - Dispatch function to be called after every retry.
- **handler** Extends [`Dispatch.DispatchHandlers`](Dispatcher.md#dispatcherdispatchoptions-handler) (required) - Handler function to be called after the request is successful or the retries are exhausted.

### Parameter `RetryOptions`

- **retry** `(err: Error, state: RetryState, opts: RetryOptions) => number | null` (optional) - Function to be called after every retry. It should return the number of milliseconds to wait before retrying or `null` to stop retrying.
- **max** `number` (optional) - Maximum number of retries. Default: `5`
- **maxTimeout** `number` (optional) - Maximum number of milliseconds to wait before retrying. Default: `30000` (30 seconds)
- **minTimeout** `number` (optional) - Minimum number of milliseconds to wait before retrying. Default: `500` (half a second)
- **timeoutFactor** `number` (optional) - Factor to multiply the timeout by for each retry attempt. Default: `2`
- **retryAfter** `boolean` (optional) - It enables automatic retry after the `Retry-After` header is received. Default: `true`
-
- **methods** `string[]` (optional) - Array of HTTP methods to retry. Default: `['GET', 'PUT', 'HEAD', 'OPTIONS', 'DELETE']`
- **idempotent** `boolean` (optional) - It enables automatic retry between requets on idempotent methods. The method should be defined as safe accordingly to [Safe Methods](https://developer.mozilla.org/en-US/docs/Glossary/Safe/HTTP). **Note**: It takes presedence over the `methods` option. Default: `false`
- **status** `number[]` (optional) - Array of HTTP status codes to retry. Default: `[429, 500, 502, 503, 504]`
- **codes** `string[]` (optional) - Array of Error codes to retry. Default: `['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'ENETDOWN','ENETUNREACH', 'EHOSTDOWN', 'EHOSTUNREACH', 'EPIPE']`
-

Examples:

```js
const client = new Client(`http://localhost:${server.address().port}`);
const chunks = [];
const handler = new RetryHandler(
  dispatchOptions,
  {
    dispatch: (...args) => {
      return client.dispatch(...args);
    },
    handler: {
      onConnect() {},
      onBodySent() {},
      onHeaders(status, _rawHeaders, resume, _statusMessage) {
        // do something with headers
      },
      onData(chunk) {
        chunks.push(chunk);
        return true;
      },
      onComplete() {},
      onError() {
        // handle error properly
      },
    },
  },
  {
    // custom retry function
    retry: function (err) {
      counter++;

      if (err.code && err.code === "UND_ERR_DESTROYED") {
        return null;
      }

      return err.statusCode === 206 ? null : 800;
    },
  }
);
```

#### Example - Basic ProxyAgent instantiation

This will instantiate the ProxyAgent. It will not do anything until registered as the agent to use with requests.

```js
import { ProxyAgent } from "undici";

const proxyAgent = new ProxyAgent("my.proxy.server");
```

#### Example - Basic Proxy Request with global agent dispatcher

```js
import { setGlobalDispatcher, request, ProxyAgent } from "undici";

const proxyAgent = new ProxyAgent("my.proxy.server");
setGlobalDispatcher(proxyAgent);

const { statusCode, body } = await request("http://localhost:3000/foo");

console.log("response received", statusCode); // response received 200

for await (const data of body) {
  console.log("data", data.toString("utf8")); // data foo
}
```

#### Example - Basic RetryHandler with defaults

```js
const client = new Client(`http://localhost:${server.address().port}`);
const handler = new RetryHandler(dispatchOptions, {
  dispatch: client.dispatch.bind(client),
  handler: {
    onConnect() {},
    onBodySent() {},
    onHeaders(status, _rawHeaders, resume, _statusMessage) {},
    onData(chunk) {},
    onComplete() {},
    onError(err) {},
  },
});
```
