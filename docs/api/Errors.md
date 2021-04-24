# Errors

Undici exposes a variety of error objects that you can use to enhance your error handling.
You can find all the error objects inside the `errors` key.

```js
const { errors } = require('undici')
```

| Error                        | Error Codes                                | Description                                           |
| -----------------------------|--------------------------------------------|-------------------------------------------------------|
| `InvalidArgumentError`       |  `UND_ERR_INVALID_ARG`                     | passed an invalid argument.                           |
| `InvalidReturnValueError`    |  `UND_ERR_INVALID_RETURN_VALUE`            | returned an invalid value.                            |
| `RequestAbortedError`        |  `UND_ERR_ABORTED`                         | the request has been aborted by the user              |
| `ClientDestroyedError`       |  `UND_ERR_DESTROYED`                       | trying to use a destroyed client.                     |
| `ClientClosedError`          |  `UND_ERR_CLOSED`                          | trying to use a closed client.                        |
| `SocketError`                |  `UND_ERR_SOCKET`                          | there is an error with the socket.                    |
| `NotSupportedError`          |  `UND_ERR_NOT_SUPPORTED`                   | encountered unsupported functionality.                |
| `RequestContentLengthError`  |  `UND_ERR_REQUEST_CONTENT_LENGTH_MISMATCH` | body does not match content-length header in request  |
| `ResponseContentLengthError` |  `UND_ERR_RESPONSE_CONTENT_LENGTH_MISMATCH`| body does not match content-length header in response * |
| `InformationalError`         |  `UND_ERR_INFO`                            | expected error with reason                            |
| `TrailerMismatchError`       |  `UND_ERR_TRAILER_MISMATCH`                | trailers did not match specification                  |

\* The `UND_ERR_RESPONSE_CONTENT_LENGTH_MISMATCH` is returned when the received body is less than the value in the received header `Content-Length`.  
If the server try to send a body larger than `Content-Length`, Undici closes the connection when the length is received and return an `UND_ERR_INFO`, to prevent a cache poisoning attack. 
