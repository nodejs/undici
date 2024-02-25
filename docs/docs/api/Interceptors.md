# Interceptors

Undici provides a way to intercept requests and responses using interceptors.

Interceptors are a way to modify the request or response before it is sent or received by the original dispatcher, apply custom logic to a network request, or even cancel the request, connect through a proxy for the origin, etc.

Within Undici there are a set of pre-built that can be used, on top of that, you can create your own interceptors.

## Pre-built interceptors

### `proxy`

The `proxy` interceptor allows you to connect to a proxy server before connecting to the origin server.

It accepts the same arguments as the [`ProxyAgent` constructor](./ProxyAgent.md).

#### Example - Basic Proxy Interceptor

```js
const { Client, interceptors } = require("undici");
const { proxy } = interceptors;

const client = new Client("http://example.com");

client.compose(proxy("http://proxy.com"));
```

### `redirect`

The `redirect` interceptor allows you to customize the way your dispatcher handles redirects.

It accepts the same arguments as the [`RedirectHandler` constructor](./RedirectHandler.md).

#### Example - Basic Redirect Interceptor

```js
const { Client, interceptors } = require("undici");
const { redirect } = interceptors;

const client = new Client("http://example.com");

client.compose(redirect({ maxRedirections: 3, throwOnMaxRedirects: true }));
```

### `retry`

The `retry` interceptor allows you to customize the way your dispatcher handles retries.

It accepts the same arguments as the [`RetryHandler` constructor](./RetryHandler.md).

#### Example - Basic Redirect Interceptor

```js
const { Client, interceptors } = require("undici");
const { retry } = interceptors;

const client = new Client("http://example.com");

client.compose(
  retry({
    maxRetries: 3,
    minTimeout: 1000,
    maxTimeout: 10000,
    timeoutFactor: 2,
    retryAfter: true,
  })
);
```
