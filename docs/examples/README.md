
## undici.request() examples

### A simple GET request, read the response body as text:
```js
const { request } = require('undici')
async function getRequest (port = 3001) {
  // A simple GET request
  const {
    statusCode,
    headers,
    body
  } = await request(`http://localhost:${port}/`)

  const data = await body.text()
  console.log('response received', statusCode)
  console.log('headers', headers)
  console.log('data', data)
}
```

### A JSON POST request, read the response body as json:
```js
const { request } = require('undici')
async function postJSONRequest (port = 3001) {
  const requestBody = {
    hello: 'JSON POST Example body'
  }

  const {
    statusCode,
    headers,
    body
  } = await request(
    `http://localhost:${port}/json`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(requestBody) }
  )

  // .json() will fail if we did not receive a valid json body in response:
  const decodedJson = await body.json()
  console.log('response received', statusCode)
  console.log('headers', headers)
  console.log('data', decodedJson)
}
```

### A Form POST request, read the response body as text:
```js
const { request } = require('undici')
async function postFormRequest (port = 3001) {
  // Make a URL-encoded form POST request:
  const qs = require('node:querystring')

  const requestBody = {
    hello: 'URL Encoded Example body'
  }

  const {
    statusCode,
    headers,
    body
  } = await request(
    `http://localhost:${port}/form`,
    { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: qs.stringify(requestBody) }
  )

  const data = await body.text()
  console.log('response received', statusCode)
  console.log('headers', headers)
  console.log('data', data)
}
```

### A FormData request with file stream, read the response body as text

```js
const { request } = require('undici')
const { openAsBlob } = require('fs')

async function formDataBlobRequest () {
  // Make a FormData request with file stream:

  const formData = new FormData()
  formData.append('field', 42)
  formData.set('file', await openAsBlob('./index.mjs'))

  const {
    statusCode,
    headers,
    body
  } = await request('http://127.0.0.1:3000', {
    method: 'POST',
    body: formData
  })

  const data = await body.text()
  console.log('response received', statusCode)
  console.log('headers', headers)
  console.log('data', data)
}

```

### A DELETE request
```js
const { request } = require('undici')
async function deleteRequest (port = 3001) {
  // Make a DELETE request
  const {
    statusCode,
    headers,
    body
  } = await request(
    `http://localhost:${port}/something`,
    { method: 'DELETE' }
  )

  console.log('response received', statusCode)
  console.log('headers', headers)
  // For a DELETE request we expect a 204 response with no body if successful, in which case getting the body content with .json() will fail
  if (statusCode === 204) {
    console.log('delete successful')
    // always consume the body if there is one:
    await body.dump()
  } else {
    const data = await body.text()
    console.log('received unexpected data', data)
  }
}
```

## Production configuration

### Using interceptors to add response caching, DNS lookup caching and connection retries

```js
import { Agent, interceptors, setGlobalDispatcher } from 'undici'

// Interceptors to add response caching, DNS caching and retrying to the dispatcher
const { cache, dns, retry } = interceptors

const defaultDispatcher = new Agent({
  connections: 100, // Limit concurrent kept-alive connections to not run out of resources
  headersTimeout: 10_000, // 10 seconds; set as appropriate for the remote servers you plan to connect to
  bodyTimeout: 10_000,
}).compose(cache(), dns(), retry())

setGlobalDispatcher(defaultDispatcher) // Add these interceptors to all `fetch` and Undici `request` calls
```

## Connecting via Unix domain sockets (UDS)

### request() over UDS (per-call dispatcher)
```js
const { Agent, request } = require('undici')

async function requestOverUds () {
  const uds = new Agent({ connect: { socketPath: '/var/run/docker.sock' } })
  try {
    const { statusCode, headers, body } = await request('http://localhost/_ping', {
      dispatcher: uds
    })
    console.log(statusCode, headers, await body.text())
  } finally {
    await uds.close()
  }
}
```

### fetch() over UDS (per-call dispatcher)
```js
const { Agent, fetch } = require('undici')

async function fetchOverUds () {
  const uds = new Agent({ connect: { socketPath: '/var/run/docker.sock' } })
  try {
    const res = await fetch('http://localhost/containers/json', { dispatcher: uds })
    console.log(res.status, await res.text())
  } finally {
    await uds.close()
  }
}
```

### Global dispatcher (apply to all request()/fetch())
```js
const { Agent, setGlobalDispatcher } = require('undici')

setGlobalDispatcher(new Agent({ connect: { socketPath: '/var/run/docker.sock' } }))

// Now all `request`/`fetch` calls using http(s)://localhost will go over the Unix socket
```

### HTTPS over UDS (optional)
```js
const { Agent, fetch } = require('undici')

const udsTls = new Agent({
  connect: { socketPath: '/var/run/my.sock', tls: { rejectUnauthorized: false } }
})

const res = await fetch('https://localhost/secure', { dispatcher: udsTls })
console.log(res.status)
await udsTls.close()
```
