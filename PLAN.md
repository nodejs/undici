# Fix Plan: WebSocket permessage-deflate Decompression Bomb Vulnerability

## Overview

This document outlines the plan to fix the unbounded memory consumption vulnerability in the WebSocket permessage-deflate implementation.

## Root Cause

In `lib/web/websocket/permessage-deflate.js`, the `decompress()` method accumulates all decompressed data without any size limit:

```javascript
this.#inflate.on('data', (data) => {
  this.#inflate[kBuffer].push(data)
  this.#inflate[kLength] += data.length  // No limit check
})
```

## Fix Strategy

### 1. Add Maximum Decompressed Size Limit

Introduce a configurable maximum size for decompressed WebSocket messages. When the limit is exceeded during decompression, abort immediately and emit an error.

**Default limit:** 128 MB (reasonable for most applications, prevents extreme memory consumption)

### 2. Implementation Changes

#### File: `lib/web/websocket/permessage-deflate.js`

1. Add a constant for the default max payload size:
   ```javascript
   const kDefaultMaxDecompressedSize = 128 * 1024 * 1024 // 128 MB
   ```

2. Accept an optional `maxDecompressedSize` parameter in the constructor

3. Modify the `data` event handler to check cumulative size:
   ```javascript
   this.#inflate.on('data', (data) => {
     this.#inflate[kLength] += data.length
     if (this.#inflate[kLength] > this.#maxDecompressedSize) {
       this.#inflate.destroy()
       this.#inflate = null
       callback(new Error('Max decompressed size exceeded'))
       return
     }
     this.#inflate[kBuffer].push(data)
   })
   ```

4. Handle the case where inflation is aborted mid-stream

#### File: `lib/web/websocket/receiver.js`

1. Pass configuration options to `PerMessageDeflate` constructor
2. Handle decompression errors appropriately (close connection with status 1009 - Message Too Big)

#### File: `lib/web/websocket/websocket.js`

1. Accept optional `maxDecompressedMessageSize` in WebSocket constructor options
2. Pass the option through to the receiver/decompressor

### 3. Error Handling

When the limit is exceeded:
- Destroy the inflate stream immediately to stop further processing
- Close the WebSocket connection with status code 1009 (Message Too Big)
- Emit an error event to notify the application

### 4. Testing

Create comprehensive tests in `test/websocket/permessage-deflate-limit.js` following the project's testing patterns.

#### Test Infrastructure

The tests require a helper to create compressed payloads with controlled decompression ratios:

```javascript
'use strict'

const { test, after } = require('node:test')
const { once } = require('node:events')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')
const zlib = require('node:zlib')

/**
 * Creates a compressed payload that decompresses to approximately targetSize bytes.
 * Uses repeated 'A' characters which compress extremely well.
 */
function createCompressedPayload (targetSize) {
  const data = Buffer.alloc(targetSize, 0x41) // 'A' repeated
  return zlib.deflateRawSync(data)
}
```

#### Test Cases

##### 1. Normal Operation - Messages Under Limit

```javascript
test('Compressed message under limit decompresses successfully', async (t) => {
  const server = new WebSocketServer({
    port: 0,
    perMessageDeflate: true
  })
  after(() => server.close())

  await once(server, 'listening')

  server.on('connection', (ws) => {
    // Send 1 KB of data (well under any reasonable limit)
    ws.send(Buffer.alloc(1024, 0x41), { binary: true })
  })

  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`)

  const [event] = await once(client, 'message')
  t.assert.strictEqual(event.data.size, 1024)
  client.close()
})
```

##### 2. Limit Enforcement - Default Limit

```javascript
test('Compressed message exceeding default limit triggers error', async (t) => {
  const server = new WebSocketServer({
    port: 0,
    perMessageDeflate: true
  })
  after(() => server.close())

  await once(server, 'listening')

  server.on('connection', (ws) => {
    // Send data that decompresses to > 128 MB (default limit)
    const hugeData = Buffer.alloc(150 * 1024 * 1024, 0x41)
    ws.send(hugeData, { binary: true })
  })

  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`)

  const [event] = await once(client, 'error')
  t.assert.ok(event.error instanceof Error)
  t.assert.ok(event.error.message.includes('decompressed size'))
})
```

##### 3. Custom Limit - Lower Than Default

```javascript
test('Custom maxDecompressedMessageSize is enforced', async (t) => {
  const server = new WebSocketServer({
    port: 0,
    perMessageDeflate: true
  })
  after(() => server.close())

  await once(server, 'listening')

  server.on('connection', (ws) => {
    // Send 2 MB of data
    ws.send(Buffer.alloc(2 * 1024 * 1024, 0x41), { binary: true })
  })

  // Set custom limit of 1 MB
  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`, {
    maxDecompressedMessageSize: 1 * 1024 * 1024
  })

  const [event] = await once(client, 'error')
  t.assert.ok(event.error instanceof Error)
  t.assert.ok(event.error.message.includes('decompressed size'))
})
```

##### 4. Custom Limit - Higher Than Default

```javascript
test('Higher custom limit allows larger messages', async (t) => {
  const server = new WebSocketServer({
    port: 0,
    perMessageDeflate: true
  })
  after(() => server.close())

  await once(server, 'listening')

  const dataSize = 150 * 1024 * 1024 // 150 MB

  server.on('connection', (ws) => {
    ws.send(Buffer.alloc(dataSize, 0x41), { binary: true })
  })

  // Set custom limit of 200 MB
  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`, {
    maxDecompressedMessageSize: 200 * 1024 * 1024
  })

  const [event] = await once(client, 'message')
  t.assert.strictEqual(event.data.size, dataSize)
  client.close()
})
```

##### 5. Edge Case - Exactly At Limit

```javascript
test('Message exactly at limit succeeds', async (t) => {
  const limit = 1 * 1024 * 1024 // 1 MB
  const server = new WebSocketServer({
    port: 0,
    perMessageDeflate: true
  })
  after(() => server.close())

  await once(server, 'listening')

  server.on('connection', (ws) => {
    ws.send(Buffer.alloc(limit, 0x41), { binary: true })
  })

  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`, {
    maxDecompressedMessageSize: limit
  })

  const [event] = await once(client, 'message')
  t.assert.strictEqual(event.data.size, limit)
  client.close()
})
```

##### 6. Edge Case - One Byte Over Limit

```javascript
test('Message one byte over limit fails', async (t) => {
  const limit = 1 * 1024 * 1024 // 1 MB
  const server = new WebSocketServer({
    port: 0,
    perMessageDeflate: true
  })
  after(() => server.close())

  await once(server, 'listening')

  server.on('connection', (ws) => {
    ws.send(Buffer.alloc(limit + 1, 0x41), { binary: true })
  })

  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`, {
    maxDecompressedMessageSize: limit
  })

  const [event] = await once(client, 'error')
  t.assert.ok(event.error instanceof Error)
})
```

##### 7. Connection Close Code

```javascript
test('Connection closes with code 1009 when limit exceeded', async (t) => {
  const server = new WebSocketServer({
    port: 0,
    perMessageDeflate: true
  })
  after(() => server.close())

  await once(server, 'listening')

  server.on('connection', (ws) => {
    ws.send(Buffer.alloc(2 * 1024 * 1024, 0x41), { binary: true })
  })

  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`, {
    maxDecompressedMessageSize: 1 * 1024 * 1024
  })

  const [event] = await once(client, 'close')
  t.assert.strictEqual(event.code, 1009) // Message Too Big
})
```

##### 8. Memory Safety - Early Abort

```javascript
test('Decompression aborts early without consuming full memory', async (t) => {
  const server = new WebSocketServer({
    port: 0,
    perMessageDeflate: true
  })
  after(() => server.close())

  await once(server, 'listening')

  server.on('connection', (ws) => {
    // Send data that would decompress to 500 MB
    ws.send(Buffer.alloc(500 * 1024 * 1024, 0x41), { binary: true })
  })

  const memBefore = process.memoryUsage().external

  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`, {
    maxDecompressedMessageSize: 10 * 1024 * 1024 // 10 MB limit
  })

  await once(client, 'error')

  const memAfter = process.memoryUsage().external
  const memGrowth = memAfter - memBefore

  // Memory growth should be bounded by limit, not by full decompressed size
  // Allow some overhead but should be nowhere near 500 MB
  t.assert.ok(memGrowth < 50 * 1024 * 1024,
    `Memory grew by ${memGrowth} bytes, expected < 50 MB`)
})
```

##### 9. Non-Compressed Messages Unaffected

```javascript
test('Non-compressed messages are not affected by limit', async (t) => {
  const server = new WebSocketServer({
    port: 0,
    perMessageDeflate: false // Compression disabled
  })
  after(() => server.close())

  await once(server, 'listening')

  server.on('connection', (ws) => {
    ws.send(Buffer.alloc(2 * 1024 * 1024, 0x41), { binary: true })
  })

  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`, {
    maxDecompressedMessageSize: 1 * 1024 * 1024
  })

  // Should succeed because compression is not used
  const [event] = await once(client, 'message')
  t.assert.strictEqual(event.data.size, 2 * 1024 * 1024)
  client.close()
})
```

##### 10. PoC Validation Test

```javascript
test('Decompression bomb is mitigated', async (t) => {
  // This test validates the fix using a technique similar to the PoC
  const http = require('node:http')
  const crypto = require('node:crypto')

  // Minimal malicious server (from poc/server_e2e.js pattern)
  const server = http.createServer()

  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key']
    const accept = crypto
      .createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64')

    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      'Sec-WebSocket-Extensions: permessage-deflate',
      '', ''
    ].join('\r\n'))

    // Send a small payload that decompresses to ~100 MB
    setTimeout(() => {
      const bomb = createDeflateBomb(100 * 1024 * 1024)
      const frame = makeWsFrame({ opcode: 2, rsv1: true, payload: bomb })
      socket.write(frame)
    }, 100)
  })

  await new Promise(resolve => server.listen(0, resolve))
  after(() => server.close())

  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`, {
    maxDecompressedMessageSize: 10 * 1024 * 1024 // 10 MB limit
  })

  const [event] = await once(client, 'error')
  t.assert.ok(event.error instanceof Error)
  t.assert.ok(event.error.message.includes('decompressed size'))
})
```

#### Running Tests

```bash
# Run just the new test file
node --test test/websocket/permessage-deflate-limit.js

# Run all websocket tests
npm run test:websocket

# Run with increased memory to test large payloads safely
node --max-old-space-size=1024 --test test/websocket/permessage-deflate-limit.js
```

### 5. Documentation

Update documentation to describe:
- The new `maxDecompressedMessageSize` option
- Default value (128 MB)
- Security implications of increasing the limit

## Implementation Order

1. [ ] Modify `PerMessageDeflate` class to accept and enforce size limit
2. [ ] Update `Receiver` to pass options and handle decompression errors
3. [ ] Update `WebSocket` constructor to accept the new option
4. [ ] Add unit tests for the new limit behavior
5. [ ] Update TypeScript types in `types/websocket.d.ts`
6. [ ] Test with the existing PoC to confirm fix effectiveness

## Verification

After implementation, run the PoC with a low limit:
- Server sends 100 MB decompression bomb
- Client configured with 10 MB limit
- Expected: Connection closes with error before memory exhaustion

## Backwards Compatibility

- Default behavior changes: connections will now close if a message decompresses to >128 MB
- Applications expecting larger messages must explicitly set `maxDecompressedMessageSize`
- This is an acceptable breaking change for a security fix
