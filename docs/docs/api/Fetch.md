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

## Differences Between Undici's Fetch and the Standard Fetch API

The `fetch` implementation in Undici is inspired by the Fetch API standard but has some key differences:

1. **`new Response(asyncIterable)`**:
   - Undici extends the standard `Response` constructor to accept an `asyncIterable` as its body. This allows streams and other async sources to be directly used. This feature is not part of the Fetch API in browsers.

2. **Cookies Handling**:
   - Unlike browsers, Undici does not automatically manage cookies. In browsers, cookies are managed through the `Cookie` header and automatically sent with requests. In Undici, you need to manually handle cookies.

3. **No Forbidden Headers**:
   - In browsers, some headers (e.g., `User-Agent`, `Referer`) are restricted from being modified for security reasons. In Undici, these headers can be freely set.

4. **Environment-Specific Behavior**:
   - Undici operates outside of a browser environment, so browser-specific features like Service Workers and Cache API are unavailable.

For a complete reference, see the [WHATWG Fetch Standard](https://fetch.spec.whatwg.org/).