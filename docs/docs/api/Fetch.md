# Fetch

Undici exposes a fetch() method starts the process of fetching a resource from the network.

Documentation and examples can be found on [MDN](https://developer.mozilla.org/en-US/docs/Web/API/fetch).

## FormData

This API is implemented as per the standard, you can find documentation on [MDN](https://developer.mozilla.org/en-US/docs/Web/API/FormData).

If any parameters are passed to the FormData constructor other than `undefined`, an error will be thrown. Other parameters are ignored.

## Response

This API is implemented as per the standard, you can find documentation on [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Response)

## Request

This API is implemented as per the standard, you can find documentation on [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Request)

## Header

This API is implemented as per the standard, you can find documentation on [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Headers)

### Forbidden headers

Undici follows the Fetch specification rules for forbidden header names.
This means some browser-controlled headers cannot be set manually in
`fetch()` or `new Request()` calls.

For example, setting a `connection` header will throw an error such as
`InvalidArgumentError: invalid connection header`.

If your code is migrating from another HTTP client, remove these headers
and let Undici manage connection-level behavior.

See the [Fetch standard's list of forbidden request-header names](https://fetch.spec.whatwg.org/#forbidden-request-header).

# Body Mixins

`Response` and `Request` body inherit body mixin methods. These methods include:

- [`.arrayBuffer()`](https://fetch.spec.whatwg.org/#dom-body-arraybuffer)
- [`.blob()`](https://fetch.spec.whatwg.org/#dom-body-blob)
- [`.bytes()`](https://fetch.spec.whatwg.org/#dom-body-bytes)
- [`.formData()`](https://fetch.spec.whatwg.org/#dom-body-formdata)
- [`.json()`](https://fetch.spec.whatwg.org/#dom-body-json)
- [`.text()`](https://fetch.spec.whatwg.org/#dom-body-text)

There is an ongoing discussion regarding `.formData()` and its usefulness and performance in server environments. It is recommended to use a dedicated library for parsing `multipart/form-data` bodies, such as [Busboy](https://www.npmjs.com/package/busboy) or [@fastify/busboy](https://www.npmjs.com/package/@fastify/busboy).

These libraries can be interfaced with fetch with the following example code:

```mjs
import { Busboy } from '@fastify/busboy'
import { Readable } from 'node:stream'

const response = await fetch('...')
const busboy = new Busboy({
  headers: {
    'content-type': response.headers.get('content-type')
  }
})

Readable.fromWeb(response.body).pipe(busboy)
```
