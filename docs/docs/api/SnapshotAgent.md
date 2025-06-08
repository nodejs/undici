# SnapshotAgent

The `SnapshotAgent` provides a powerful way to record and replay HTTP requests for testing purposes. It extends `MockAgent` to enable automatic snapshot testing, eliminating the need to manually define mock responses.

## Use Cases

- **Integration Testing**: Record real API interactions and replay them in tests
- **Offline Development**: Work with APIs without network connectivity
- **Consistent Test Data**: Ensure tests use the same responses across runs
- **API Contract Testing**: Capture and validate API behavior over time

## Constructor

```javascript
new SnapshotAgent([options])
```

### Parameters

- **options** `Object` (optional)
  - **mode** `String` - The snapshot mode: `'record'`, `'playback'`, or `'update'`. Default: `'record'`
  - **snapshotPath** `String` - Path to the snapshot file for loading/saving
  - All other options from `MockAgent` are supported

### Modes

#### Record Mode (`'record'`)
Makes real HTTP requests and saves the responses to snapshots.

```javascript
import { SnapshotAgent, setGlobalDispatcher } from 'undici'

const agent = new SnapshotAgent({ 
  mode: 'record',
  snapshotPath: './test/snapshots/api-calls.json'
})
setGlobalDispatcher(agent)

// Makes real requests and records them
const response = await fetch('https://api.example.com/users')
const users = await response.json()

// Save recorded snapshots
await agent.saveSnapshots()
```

#### Playback Mode (`'playback'`)
Replays recorded responses without making real HTTP requests.

```javascript
import { SnapshotAgent, setGlobalDispatcher } from 'undici'

const agent = new SnapshotAgent({
  mode: 'playback',
  snapshotPath: './test/snapshots/api-calls.json'
})
setGlobalDispatcher(agent)

// Uses recorded response instead of real request
const response = await fetch('https://api.example.com/users')
```

#### Update Mode (`'update'`)
Uses existing snapshots when available, but records new ones for missing requests.

```javascript
import { SnapshotAgent, setGlobalDispatcher } from 'undici'

const agent = new SnapshotAgent({
  mode: 'update',
  snapshotPath: './test/snapshots/api-calls.json'
})
setGlobalDispatcher(agent)

// Uses snapshot if exists, otherwise makes real request and records it
const response = await fetch('https://api.example.com/new-endpoint')
```

## Instance Methods

### `agent.saveSnapshots([filePath])`

Saves all recorded snapshots to a file.

#### Parameters

- **filePath** `String` (optional) - Path to save snapshots. Uses constructor `snapshotPath` if not provided.

#### Returns

`Promise<void>`

```javascript
await agent.saveSnapshots('./custom-snapshots.json')
```

### `agent.loadSnapshots([filePath])`

Loads snapshots from a file.

#### Parameters

- **filePath** `String` (optional) - Path to load snapshots from. Uses constructor `snapshotPath` if not provided.

#### Returns

`Promise<void>`

```javascript
await agent.loadSnapshots('./existing-snapshots.json')
```

### `agent.getRecorder()`

Gets the underlying `SnapshotRecorder` instance.

#### Returns

`SnapshotRecorder`

```javascript
const recorder = agent.getRecorder()
console.log(`Recorded ${recorder.size()} interactions`)
```

### `agent.getMode()`

Gets the current snapshot mode.

#### Returns

`String` - The current mode (`'record'`, `'playback'`, or `'update'`)

### `agent.clearSnapshots()`

Clears all recorded snapshots from memory.

```javascript
agent.clearSnapshots()
```

## Working with Different Request Types

### GET Requests

```javascript
// Record mode
const agent = new SnapshotAgent({ mode: 'record', snapshotPath: './get-snapshots.json' })
setGlobalDispatcher(agent)

const response = await fetch('https://jsonplaceholder.typicode.com/posts/1')
const post = await response.json()

await agent.saveSnapshots()
```

### POST Requests with Body

```javascript
// Record mode
const agent = new SnapshotAgent({ mode: 'record', snapshotPath: './post-snapshots.json' })
setGlobalDispatcher(agent)

const response = await fetch('https://jsonplaceholder.typicode.com/posts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'Test Post', body: 'Content' })
})

await agent.saveSnapshots()
```

### Using with `undici.request`

SnapshotAgent works with all undici APIs, not just fetch:

```javascript
import { SnapshotAgent, request, setGlobalDispatcher } from 'undici'

const agent = new SnapshotAgent({ mode: 'record', snapshotPath: './request-snapshots.json' })
setGlobalDispatcher(agent)

const { statusCode, headers, body } = await request('https://api.example.com/data')
const data = await body.json()

await agent.saveSnapshots()
```

## Test Integration

### Basic Test Setup

```javascript
import { test } from 'node:test'
import { SnapshotAgent, setGlobalDispatcher, getGlobalDispatcher } from 'undici'

test('API integration test', async (t) => {
  const originalDispatcher = getGlobalDispatcher()
  
  const agent = new SnapshotAgent({
    mode: 'playback',
    snapshotPath: './test/snapshots/api-test.json'
  })
  setGlobalDispatcher(agent)
  
  t.after(() => setGlobalDispatcher(originalDispatcher))
  
  // This will use recorded data
  const response = await fetch('https://api.example.com/users')
  const users = await response.json()
  
  assert(Array.isArray(users))
  assert(users.length > 0)
})
```

### Environment-Based Mode Selection

```javascript
const mode = process.env.SNAPSHOT_MODE || 'playback'

const agent = new SnapshotAgent({
  mode,
  snapshotPath: './test/snapshots/integration.json'
})

// Run with: SNAPSHOT_MODE=record npm test (to record)
// Run with: npm test (to playback)
```

### Test Helper Function

```javascript
function createSnapshotAgent(testName, mode = 'playback') {
  return new SnapshotAgent({
    mode,
    snapshotPath: `./test/snapshots/${testName}.json`
  })
}

test('user API test', async (t) => {
  const agent = createSnapshotAgent('user-api')
  setGlobalDispatcher(agent)
  
  // Test implementation...
})
```

## Snapshot File Format

Snapshots are stored as JSON with the following structure:

```json
[
  {
    "hash": "dGVzdC1oYXNo...",
    "snapshot": {
      "request": {
        "method": "GET",
        "url": "https://api.example.com/users",
        "headers": {
          "authorization": "Bearer token"
        },
        "body": undefined
      },
      "response": {
        "statusCode": 200,
        "headers": {
          "content-type": "application/json"
        },
        "body": "eyJkYXRhIjoidGVzdCJ9", // base64 encoded
        "trailers": {}
      },
      "timestamp": "2024-01-01T00:00:00.000Z"
    }
  }
]
```

## Error Handling

### Missing Snapshots in Playback Mode

```javascript
try {
  const response = await fetch('https://api.example.com/nonexistent')
} catch (error) {
  if (error.message.includes('No snapshot found')) {
    // Handle missing snapshot
    console.log('Snapshot not found for this request')
  }
}
```

### Handling Network Errors in Record Mode

```javascript
const agent = new SnapshotAgent({ mode: 'record', snapshotPath: './snapshots.json' })

try {
  const response = await fetch('https://nonexistent-api.example.com/data')
} catch (error) {
  // Network errors are not recorded as snapshots
  console.log('Network error:', error.message)
}
```

## Best Practices

### 1. Organize Snapshots by Test Suite

```javascript
// Use descriptive snapshot file names
const agent = new SnapshotAgent({
  mode: 'playback',
  snapshotPath: `./test/snapshots/${testSuiteName}-${testName}.json`
})
```

### 2. Version Control Snapshots

Add snapshot files to version control to ensure consistent test behavior across environments:

```gitignore
# Include snapshots in version control
!/test/snapshots/*.json
```

### 3. Clean Up Test Data

```javascript
test('API test', async (t) => {
  const agent = new SnapshotAgent({
    mode: 'playback',
    snapshotPath: './test/snapshots/temp-test.json'
  })
  
  // Clean up after test
  t.after(() => {
    agent.clearSnapshots()
  })
})
```

### 4. Snapshot Validation

```javascript
test('validate snapshot contents', async (t) => {
  const agent = new SnapshotAgent({
    mode: 'playback',
    snapshotPath: './test/snapshots/validation.json'
  })
  
  const recorder = agent.getRecorder()
  const snapshots = recorder.getSnapshots()
  
  // Validate snapshot structure
  assert(snapshots.length > 0, 'Should have recorded snapshots')
  assert(snapshots[0].request.url.startsWith('https://'), 'Should use HTTPS')
})
```

## Comparison with Other Tools

### vs Manual MockAgent Setup

**Manual MockAgent:**
```javascript
const mockAgent = new MockAgent()
const mockPool = mockAgent.get('https://api.example.com')

mockPool.intercept({
  path: '/users',
  method: 'GET'
}).reply(200, [
  { id: 1, name: 'User 1' },
  { id: 2, name: 'User 2' }
])
```

**SnapshotAgent:**
```javascript
// Record once
const agent = new SnapshotAgent({ mode: 'record', snapshotPath: './snapshots.json' })
// Real API call gets recorded automatically

// Use in tests
const agent = new SnapshotAgent({ mode: 'playback', snapshotPath: './snapshots.json' })
// Automatically replays recorded response
```

### vs nock

SnapshotAgent provides similar functionality to nock but is specifically designed for undici:

- ✅ Works with all undici APIs (`request`, `stream`, `pipeline`, etc.)
- ✅ Supports undici-specific features (RetryAgent, connection pooling)
- ✅ Better TypeScript integration
- ✅ More efficient for high-performance scenarios

## See Also

- [MockAgent](./MockAgent.md) - Manual mocking for more control
- [MockCallHistory](./MockCallHistory.md) - Inspecting request history
- [Testing Best Practices](../best-practices/writing-tests.md) - General testing guidance