# Class: WebSocket

> ⚠️ Warning: the WebSocket API is experimental.

Extends: [`EventTarget`](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget)

The WebSocket object provides a way to manage a WebSocket connection to a server, allowing bidirectional communication. The API follows the [WebSocket spec](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) and [RFC 6455](https://datatracker.ietf.org/doc/html/rfc6455).

## `new WebSocket(url[, protocol])`

Arguments:

* **url** `URL | string` - The url's protocol *must* be `ws` or `wss`.
* **protocol** `string | string[] | WebSocketInit` (optional) - Subprotocol(s) to request the server use, or a [`Dispatcher`](./Dispatcher.md).

### WebSocketInit

When passing an object as the second argument, the following options are available:

* **protocols** `string | string[]` (optional) - Subprotocol(s) to request the server use.
* **dispatcher** `Dispatcher` (optional) - A custom [`Dispatcher`](/docs/docs/api/Dispatcher.md) to use for the connection.
* **headers** `HeadersInit` (optional) - Custom headers to include in the WebSocket handshake request.
* **maxDecompressedMessageSize** `number` (optional) - Maximum allowed size in bytes for decompressed messages when using the `permessage-deflate` extension. **Default:** `4194304` (4 MB).

### Example:

This example will not work in browsers or other platforms that don't allow passing an object.

```mjs
import { WebSocket, ProxyAgent } from 'undici'

const proxyAgent = new ProxyAgent('my.proxy.server')

const ws = new WebSocket('wss://echo.websocket.events', {
  dispatcher: proxyAgent,
  protocols: ['echo', 'chat']
})
```

If you do not need a custom Dispatcher, it's recommended to use the following pattern:

```mjs
import { WebSocket } from 'undici'

const ws = new WebSocket('wss://echo.websocket.events', ['echo', 'chat'])
```

### Example with custom decompression limit:

To protect against decompression bombs (small compressed payloads that expand to very large sizes), you can set a custom limit:

```mjs
import { WebSocket } from 'undici'

const ws = new WebSocket('wss://echo.websocket.events', {
  maxDecompressedMessageSize: 1 * 1024 * 1024
})
```

> ⚠️ **Security Note**: The `maxDecompressedMessageSize` option protects against memory exhaustion attacks where a malicious server sends a small compressed payload that decompresses to an extremely large size. If you increase this limit significantly above the default, ensure your application can handle the increased memory usage.

## Read More

- [MDN - WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [The WebSocket Specification](https://www.rfc-editor.org/rfc/rfc6455)
- [The WHATWG WebSocket Specification](https://websockets.spec.whatwg.org/)
