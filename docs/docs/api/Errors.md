# Errors

Undici exposes a variety of error objects that you can use to enhance your error handling.
You can find all the error objects inside the `errors` key.

```js
import { errors } from 'undici'
```

| Error                                | Error Code                            | Description                                                               |
| ------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------- |
| `UndiciError`                        | `UND_ERR`                             | all errors below are extended from `UndiciError`.                         |
| `AbortError`                         | `UND_ERR_ABORT`                       | the operation was aborted.                                                |
| `BalancedPoolMissingUpstreamError`   | `UND_ERR_BPL_MISSING_UPSTREAM`        | trying to use a balanced pool without upstreams.                          |
| `BodyTimeoutError`                   | `UND_ERR_BODY_TIMEOUT`                | socket is destroyed due to body timeout.                                  |
| `ClientClosedError`                  | `UND_ERR_CLOSED`                      | trying to use a closed client.                                            |
| `ClientDestroyedError`               | `UND_ERR_DESTROYED`                   | trying to use a destroyed client.                                         |
| `ConnectTimeoutError`                | `UND_ERR_CONNECT_TIMEOUT`             | socket is destroyed due to connect timeout.                               |
| `HeadersOverflowError`               | `UND_ERR_HEADERS_OVERFLOW`            | socket is destroyed due to headers' max size being exceeded.              |
| `HeadersTimeoutError`                | `UND_ERR_HEADERS_TIMEOUT`             | socket is destroyed due to headers timeout.                               |
| `HTTPParserError`                    |                                       | there is an error while parsing the HTTP.                                 |
| `InformationalError`                 | `UND_ERR_INFO`                        | expected error with reason                                                |
| `InvalidArgumentError`               | `UND_ERR_INVALID_ARG`                 | passed an invalid argument.                                               |
| `InvalidReturnValueError`            | `UND_ERR_INVALID_RETURN_VALUE`        | returned an invalid value.                                                |
| `MaxOriginsReachedError`             | `UND_ERR_MAX_ORIGINS_REACHED`         | trying to add more origins than allowed.                                  |
| `NotSupportedError`                  | `UND_ERR_NOT_SUPPORTED`               | encountered unsupported functionality.                                    |
| `RequestAbortedError`                | `UND_ERR_REQUEST_ABORTED`             | the request has been aborted by the user                                  |
| `RequestContentLengthMismatchError`  | `UND_ERR_REQ_CONTENT_LENGTH_MISMATCH` | request body does not match content-length header                         |
| `RequestRetryError`                  | `UND_ERR_REQ_RETRY`                   | the request should be retried.                                            |
| `ResponseError`                      | `UND_ERR_RESPONSE`                    | there is an error with the response.                                      |
| `ResponseContentLengthMismatchError` | `UND_ERR_RES_CONTENT_LENGTH_MISMATCH` | response body does not match content-length header                        |
| `ResponseExceededMaxSizeError`       | `UND_ERR_RES_EXCEEDED_MAX_SIZE`       | response body exceed the max size allowed                                 |
| `SecureProxyConnectionError`         | `UND_ERR_PRX_TLS`                     | tls connection to a proxy failed                                          |
| `SocketError`                        | `UND_ERR_SOCKET`                      | there is an error with the socket.                                        |

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
