# Writing tests

Undici is tuned for a production use case and its default will keep
a socket open for a few seconds after an HTTP request is completed to
remove the overhead of opening up a new socket. These settings that makes
Undici shine in production are not a good fit for using Undici in automated
tests, as it will result in longer execution times.

The following are good defaults that will keep the socket open for only 10ms:

```js
import { request, setGlobalDispatcher, Agent } from 'undici'

const agent = new Agent({
  keepAliveTimeout: 10, // milliseconds
  keepAliveMaxTimeout: 10 // milliseconds
})

setGlobalDispatcher(agent)
```

## Guarding against unexpected disconnects

Undici's `Client` automatically reconnects after a socket error. This means
a test can silently disconnect, reconnect, and still pass. Unfortunately, 
this could mask bugs like unexpected parser errors or protocol violations.
To catch these silent reconnections, use the `guardDisconnect` helper from
`test/guard-disconnect.js` after creating a `Client` (or `Pool`):

```js
const { Client } = require('undici')
const { test, after } = require('node:test')
const { tspl } = require('@matteo.collina/tspl')
const { guardDisconnect } = require('./guard-disconnect')

test('example with disconnect guard', async (t) => {
  t = tspl(t, { plan: 1 })

  const client = new Client('http://localhost:3000')
  after(() => client.close())

  guardDisconnect(client, t)

  // ... test logic ...
})
```

The guard listens for `'disconnect'` events and calls `t.fail()` unless the
client is already closing or destroyed. Skip the guard for tests where a disconnect is expected behavior, such as:

- Signal aborts (`signal.emit('abort')`, `ac.abort()`)
- Server-side destruction (`res.destroy()`, `req.socket.destroy()`)
- Client-side body destruction mid-stream (`data.body.destroy()`)
- Timeout errors (`HeadersTimeoutError`, `BodyTimeoutError`)
- Successful upgrades (the socket is detached from the `Client`)
- Retry/reconnect tests where the disconnect triggers the retry
- HTTP parser errors from malformed responses (`HTTPParserError`)
