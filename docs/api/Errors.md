# Errors

Undici exposes a variety of error objects that you can use to enhance your error handling.
You can find all the error objects inside the `errors` key.

```js
import { errors } from 'undici'
```

| Error                                | Error Codes                           | Description                                        |
| ------------------------------------ | ------------------------------------- | -------------------------------------------------- |
| `InvalidArgumentError`               | `UND_ERR_INVALID_ARG`                 | passed an invalid argument.                        |
| `InvalidReturnValueError`            | `UND_ERR_INVALID_RETURN_VALUE`        | returned an invalid value.                         |
| `RequestAbortedError`                | `UND_ERR_ABORTED`                     | the request has been aborted by the user           |
| `ClientDestroyedError`               | `UND_ERR_DESTROYED`                   | trying to use a destroyed client.                  |
| `ClientClosedError`                  | `UND_ERR_CLOSED`                      | trying to use a closed client.                     |
| `SocketError`                        | `UND_ERR_SOCKET`                      | there is an error with the socket.                 |
| `NotSupportedError`                  | `UND_ERR_NOT_SUPPORTED`               | encountered unsupported functionality.             |
| `RequestContentLengthMismatchError`  | `UND_ERR_REQ_CONTENT_LENGTH_MISMATCH` | request body does not match content-length header  |
| `ResponseContentLengthMismatchError` | `UND_ERR_RES_CONTENT_LENGTH_MISMATCH` | response body does not match content-length header |
| `InformationalError`                 | `UND_ERR_INFO`                        | expected error with reason                         |
| `TrailerMismatchError`               | `UND_ERR_TRAILER_MISMATCH`            | trailers did not match specification               |

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
