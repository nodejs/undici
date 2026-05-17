# Errors

Undici exposes a variety of error objects that you can use to enhance your error handling.
You can find all the error objects inside the `errors` key.

```js
import { errors } from 'undici'
```

| Error                                | Error Codes                           | Description                                                               |
| ------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------- |
| `UndiciError`                        | `UND_ERR`                             | all errors below are extended from `UndiciError`.                         |
| `ConnectTimeoutError`                | `UND_ERR_CONNECT_TIMEOUT`             | socket is destroyed due to connect timeout.                               |
| `HeadersTimeoutError`                | `UND_ERR_HEADERS_TIMEOUT`             | socket is destroyed due to headers timeout.                               |
| `HeadersOverflowError`               | `UND_ERR_HEADERS_OVERFLOW`            | socket is destroyed due to headers' max size being exceeded.              |
| `BodyTimeoutError`                   | `UND_ERR_BODY_TIMEOUT`                | socket is destroyed due to body timeout.                                  |
| `InvalidArgumentError`               | `UND_ERR_INVALID_ARG`                 | passed an invalid argument.                                               |
| `InvalidReturnValueError`            | `UND_ERR_INVALID_RETURN_VALUE`        | returned an invalid value.                                                |
| `RequestAbortedError`                | `UND_ERR_ABORTED`                     | the request has been aborted by the user                                  |
| `ClientDestroyedError`               | `UND_ERR_DESTROYED`                   | trying to use a destroyed client.                                         |
| `ClientClosedError`                  | `UND_ERR_CLOSED`                      | trying to use a closed client.                                            |
| `SocketError`                        | `UND_ERR_SOCKET`                      | there is an error with the socket.                                        |
| `NotSupportedError`                  | `UND_ERR_NOT_SUPPORTED`               | encountered unsupported functionality.                                    |
| `RequestContentLengthMismatchError`  | `UND_ERR_REQ_CONTENT_LENGTH_MISMATCH` | request body does not match content-length header                         |
| `ResponseContentLengthMismatchError` | `UND_ERR_RES_CONTENT_LENGTH_MISMATCH` | response body does not match content-length header                        |
| `InformationalError`                 | `UND_ERR_INFO`                        | expected error with reason                                                |
| `ResponseExceededMaxSizeError`       | `UND_ERR_RES_EXCEEDED_MAX_SIZE`       | response body exceed the max size allowed                                 |
| `SecureProxyConnectionError`         | `UND_ERR_PRX_TLS`                     | tls connection to a proxy failed                                          |
| `MessageSizeExceededError`           | `UND_ERR_WS_MESSAGE_SIZE_EXCEEDED`    | WebSocket decompressed message exceeded the maximum allowed size          |

## Timeout-related errors

The timeout errors below are controlled by dispatcher/client options:

| Error code | When it is thrown | Related option |
| ---------- | ----------------- | -------------- |
| `UND_ERR_CONNECT_TIMEOUT` | A connection could not be established before the connection timeout elapsed. | [`connect.timeout`](/docs/docs/api/Client.md#parameter-connectoptions) |
| `UND_ERR_HEADERS_TIMEOUT` | The full response headers were not received before the headers timeout elapsed. | [`headersTimeout`](/docs/docs/api/Client.md#parameter-clientoptions) |
| `UND_ERR_BODY_TIMEOUT` | While reading the response body, no new data arrived before the body timeout elapsed. | [`bodyTimeout`](/docs/docs/api/Client.md#parameter-clientoptions) |
| `UND_ERR_SOCKET` | A generic socket-level failure happened (including some timeout-related socket errors). | Inspect `error.socket` and adjust your dispatcher/client socket settings. |

### Configuring timeouts for `fetch`

If you are using `fetch` (including Node.js built-in `fetch`), configure timeouts
through the global dispatcher:

```js
import { Agent, setGlobalDispatcher, fetch } from 'undici'

setGlobalDispatcher(new Agent({
  connect: { timeout: 10_000 }, // connection phase
  headersTimeout: 15_000, // wait for response headers
  bodyTimeout: 30_000 // wait between response body chunks
}))

await fetch('https://example.com/data')
```

You can inspect timeout error codes from `error.code` or (for wrapped fetch
errors) from `error.cause?.code`.

Be aware of the possible difference between the global dispatcher version and the actual undici version you might be using. We recommend to avoid the check `instanceof errors.UndiciError` and seek for the `error.code === '<error_code>'` instead to avoid inconsistencies.
### `SocketError`

The `SocketError` has a `.socket` property which holds socket metadata:

```ts
interface SocketInfo {
  localAddress?: string
  localPort?: number
  remoteAddress?: string
  remotePort?: number
  remoteFamily?: string
  timeout?: number
  bytesWritten?: number
  bytesRead?: number
}
```

Be aware that in some cases the `.socket` property can be `null`.
