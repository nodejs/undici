import { expectAssignable, expectType } from 'tsd'
import { Agent, Dispatcher, MockAgent, SnapshotAgent, setGlobalDispatcher } from '../..'
import { SnapshotRecorder } from '../../types/snapshot-agent'

// Basic constructor tests
expectAssignable<SnapshotAgent>(new SnapshotAgent())
expectAssignable<SnapshotAgent>(new SnapshotAgent({}))
expectAssignable<SnapshotAgent>(new SnapshotAgent({ mode: 'record' }))
expectAssignable<SnapshotAgent>(new SnapshotAgent({ mode: 'playback' }))
expectAssignable<SnapshotAgent>(new SnapshotAgent({ mode: 'update' }))
expectAssignable<SnapshotAgent>(new SnapshotAgent({ snapshotPath: './snapshots.json' }))

// Constructor with basic Phase 1-3 options
expectAssignable<SnapshotAgent>(new SnapshotAgent({
  mode: 'record',
  snapshotPath: './snapshots.json',
  maxSnapshots: 100,
  autoFlush: true,
  flushInterval: 5000
}))

// Constructor with Phase 2 matching options
expectAssignable<SnapshotAgent>(new SnapshotAgent({
  mode: 'playback',
  snapshotPath: './snapshots.json',
  matchHeaders: ['content-type', 'accept'],
  ignoreHeaders: ['authorization', 'x-api-key'],
  excludeHeaders: ['set-cookie', 'authorization'],
  matchBody: true,
  matchQuery: false,
  caseSensitive: false
}))

// Constructor with all options combined
expectAssignable<SnapshotAgent>(new SnapshotAgent({
  mode: 'update',
  snapshotPath: './snapshots.json',
  maxSnapshots: 50,
  autoFlush: true,
  flushInterval: 10000,
  matchHeaders: ['content-type'],
  ignoreHeaders: ['user-agent'],
  excludeHeaders: ['cookie'],
  matchBody: false,
  matchQuery: true,
  caseSensitive: true,
  connections: 5, // MockAgent option
  enableCallHistory: true // MockAgent option
}))

// SnapshotAgent extends MockAgent
expectAssignable<MockAgent>(new SnapshotAgent())
expectAssignable<Dispatcher>(new SnapshotAgent())

{
  const snapshotAgent = new SnapshotAgent()
  expectAssignable<void>(setGlobalDispatcher(snapshotAgent))

  // Original snapshot methods
  expectType<Promise<void>>(snapshotAgent.saveSnapshots())
  expectType<Promise<void>>(snapshotAgent.saveSnapshots('./custom.json'))
  expectType<Promise<void>>(snapshotAgent.loadSnapshots())
  expectType<Promise<void>>(snapshotAgent.loadSnapshots('./custom.json'))
  expectType<SnapshotRecorder>(snapshotAgent.getRecorder())
  expectType<'record' | 'playback' | 'update'>(snapshotAgent.getMode())
  expectType<void>(snapshotAgent.clearSnapshots())

  // New Phase 3 snapshot management methods
  expectType<void>(snapshotAgent.resetCallCounts())
  expectType<boolean>(snapshotAgent.deleteSnapshot({}))
  expectType<SnapshotRecorder.SnapshotInfo | null>(snapshotAgent.getSnapshotInfo({}))
  expectType<void>(snapshotAgent.replaceSnapshots([]))

  // Inherited MockAgent methods
  expectType<Promise<void>>(snapshotAgent.close())
  expectType<void>(snapshotAgent.deactivate())
  expectType<void>(snapshotAgent.activate())
  expectType<void>(snapshotAgent.enableNetConnect())
  expectType<void>(snapshotAgent.disableNetConnect())
}

{
  // Constructor with agent option
  const agent = new Agent()
  const snapshotAgent = new SnapshotAgent({
    mode: 'record',
    agent,
    maxSnapshots: 25
  })

  expectAssignable<SnapshotAgent>(snapshotAgent)
}

{
  // SnapshotRecorder standalone usage - basic options
  const recorder = new SnapshotRecorder()
  expectType<Promise<void>>(recorder.record({}, {}))
  expectType<SnapshotRecorder.Snapshot | undefined>(recorder.findSnapshot({}))
  expectType<Promise<void>>(recorder.loadSnapshots())
  expectType<Promise<void>>(recorder.loadSnapshots('./file.json'))
  expectType<Promise<void>>(recorder.saveSnapshots())
  expectType<Promise<void>>(recorder.saveSnapshots('./file.json'))
  expectType<void>(recorder.clear())
  expectType<SnapshotRecorder.Snapshot[]>(recorder.getSnapshots())
  expectType<number>(recorder.size())

  // New Phase 3 methods
  expectType<void>(recorder.resetCallCounts())
  expectType<boolean>(recorder.deleteSnapshot({}))
  expectType<SnapshotRecorder.SnapshotInfo | null>(recorder.getSnapshotInfo({}))
  expectType<void>(recorder.replaceSnapshots([]))
  expectType<void>(recorder.destroy())
}

{
  // SnapshotRecorder with full options
  const recorder = new SnapshotRecorder({
    snapshotPath: './test.json',
    mode: 'record',
    maxSnapshots: 100,
    autoFlush: true,
    flushInterval: 30000,
    matchHeaders: ['accept', 'content-type'],
    ignoreHeaders: ['user-agent'],
    excludeHeaders: ['authorization', 'cookie'],
    matchBody: true,
    matchQuery: true,
    caseSensitive: false
  })

  expectAssignable<SnapshotRecorder>(recorder)
}

// Test Options interfaces completeness
expectAssignable<SnapshotRecorder.Options>({})
expectAssignable<SnapshotRecorder.Options>({
  snapshotPath: './test.json'
})
expectAssignable<SnapshotRecorder.Options>({
  mode: 'playback',
  maxSnapshots: 50
})
expectAssignable<SnapshotRecorder.Options>({
  autoFlush: true,
  flushInterval: 15000
})
expectAssignable<SnapshotRecorder.Options>({
  matchHeaders: ['content-type'],
  ignoreHeaders: ['authorization'],
  excludeHeaders: ['set-cookie']
})
expectAssignable<SnapshotRecorder.Options>({
  matchBody: false,
  matchQuery: true,
  caseSensitive: true
})

expectAssignable<SnapshotAgent.Options>({})
expectAssignable<SnapshotAgent.Options>({
  mode: 'update',
  snapshotPath: './snapshots.json',
  connections: 2 // MockAgent option
})

{
  // New snapshot structure with responses array
  const snapshot: SnapshotRecorder.Snapshot = {
    request: {
      method: 'GET',
      url: 'https://api.example.com/test',
      headers: { authorization: 'Bearer token' },
      body: '{"test": "data"}'
    },
    responses: [{
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: 'eyJ0ZXN0IjoiZGF0YSJ9', // base64
      trailers: {}
    }],
    callCount: 0,
    timestamp: '2024-01-01T00:00:00.000Z'
  }

  expectType<string>(snapshot.request.method)
  expectType<string>(snapshot.request.url)
  expectType<Record<string, string>>(snapshot.request.headers)
  expectType<string | undefined>(snapshot.request.body)
  expectType<Array<{
    statusCode: number
    headers: Record<string, string>
    body: string
    trailers: Record<string, string>
  }>>(snapshot.responses)
  expectType<number>(snapshot.callCount)
  expectType<string>(snapshot.timestamp)
}

{
  // Sequential responses support
  const sequentialSnapshot: SnapshotRecorder.Snapshot = {
    request: {
      method: 'POST',
      url: 'https://api.example.com/sequence',
      headers: { 'content-type': 'application/json' }
    },
    responses: [
      {
        statusCode: 201,
        headers: { 'content-type': 'application/json' },
        body: '{"id": 1}',
        trailers: {}
      },
      {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: '{"id": 1, "status": "updated"}',
        trailers: {}
      },
      {
        statusCode: 204,
        headers: {},
        body: '',
        trailers: {}
      }
    ],
    callCount: 2,
    timestamp: '2024-01-01T00:00:00.000Z'
  }

  expectAssignable<SnapshotRecorder.Snapshot>(sequentialSnapshot)
}

{
  // SnapshotInfo interface test
  const info: SnapshotRecorder.SnapshotInfo = {
    hash: 'abc123def456',
    request: {
      method: 'PUT',
      url: 'https://api.example.com/update',
      headers: { 'content-type': 'application/json' },
      body: '{"data": "value"}'
    },
    responseCount: 3,
    callCount: 1,
    timestamp: '2024-01-01T00:00:00.000Z'
  }

  expectType<string>(info.hash)
  expectType<{
    method: string
    url: string
    headers: Record<string, string>
    body?: string
  }>(info.request)
  expectType<number>(info.responseCount)
  expectType<number>(info.callCount)
  expectType<string>(info.timestamp)
}

{
  // SnapshotData interface for replacement
  const snapshotData: SnapshotRecorder.SnapshotData = {
    hash: 'replacement-hash',
    snapshot: {
      request: {
        method: 'DELETE',
        url: 'https://api.example.com/delete/123',
        headers: { authorization: 'Bearer token' }
      },
      responses: [{
        statusCode: 204,
        headers: {},
        body: '',
        trailers: {}
      }],
      callCount: 0,
      timestamp: '2024-01-01T00:00:00.000Z'
    }
  }

  expectType<string>(snapshotData.hash)
  expectType<SnapshotRecorder.Snapshot>(snapshotData.snapshot)
}

{
  // Array operations for replaceSnapshots
  const snapshotDataArray: SnapshotRecorder.SnapshotData[] = [
    {
      hash: 'hash1',
      snapshot: {
        request: { method: 'GET', url: 'https://example.com/1', headers: {} },
        responses: [{ statusCode: 200, headers: {}, body: 'response1', trailers: {} }],
        callCount: 0,
        timestamp: '2024-01-01T00:00:00.000Z'
      }
    },
    {
      hash: 'hash2',
      snapshot: {
        request: { method: 'POST', url: 'https://example.com/2', headers: {} },
        responses: [
          { statusCode: 201, headers: {}, body: 'created', trailers: {} },
          { statusCode: 200, headers: {}, body: 'updated', trailers: {} }
        ],
        callCount: 1,
        timestamp: '2024-01-01T01:00:00.000Z'
      }
    }
  ]

  const agent = new SnapshotAgent()
  const recorder = new SnapshotRecorder()

  expectType<void>(agent.replaceSnapshots(snapshotDataArray))
  expectType<void>(recorder.replaceSnapshots(snapshotDataArray))
}

{
  // Test method parameter types
  const agent = new SnapshotAgent()
  const requestOpts = {
    origin: 'https://api.example.com',
    path: '/test',
    method: 'GET',
    headers: { accept: 'application/json' }
  }

  expectType<boolean>(agent.deleteSnapshot(requestOpts))
  expectType<SnapshotRecorder.SnapshotInfo | null>(agent.getSnapshotInfo(requestOpts))

  const recorder = new SnapshotRecorder()
  expectType<boolean>(recorder.deleteSnapshot(requestOpts))
  expectType<SnapshotRecorder.SnapshotInfo | null>(recorder.getSnapshotInfo(requestOpts))
}

{
  // Test optional body in request
  const snapshotWithoutBody: SnapshotRecorder.Snapshot = {
    request: {
      method: 'GET',
      url: 'https://api.example.com/get',
      headers: { accept: 'application/json' }
      // body is optional
    },
    responses: [{
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: 'response-data',
      trailers: {}
    }],
    callCount: 0,
    timestamp: '2024-01-01T00:00:00.000Z'
  }

  expectAssignable<SnapshotRecorder.Snapshot>(snapshotWithoutBody)
}

{
  // Test mode type constraints
  const recordAgent = new SnapshotAgent({ mode: 'record' })
  const playbackAgent = new SnapshotAgent({ mode: 'playback', snapshotPath: './test.json' })
  const updateAgent = new SnapshotAgent({ mode: 'update', snapshotPath: './test.json' })

  expectType<'record' | 'playback' | 'update'>(recordAgent.getMode())
  expectType<'record' | 'playback' | 'update'>(playbackAgent.getMode())
  expectType<'record' | 'playback' | 'update'>(updateAgent.getMode())
}

{
  // Test array types for header configuration
  const matchHeaders: string[] = ['content-type', 'accept', 'authorization']
  const ignoreHeaders: string[] = ['user-agent', 'x-request-id']
  const excludeHeaders: string[] = ['set-cookie', 'authorization']

  expectAssignable<SnapshotAgent.Options>({
    matchHeaders,
    ignoreHeaders,
    excludeHeaders
  })

  expectAssignable<SnapshotRecorder.Options>({
    matchHeaders,
    ignoreHeaders,
    excludeHeaders
  })
}

// Test boolean configuration options
expectAssignable<SnapshotAgent.Options>({
  matchBody: true,
  matchQuery: false,
  caseSensitive: true,
  autoFlush: false
})

expectAssignable<SnapshotRecorder.Options>({
  matchBody: false,
  matchQuery: true,
  caseSensitive: false,
  autoFlush: true
})

// Test number configuration options
expectAssignable<SnapshotAgent.Options>({
  maxSnapshots: 100,
  flushInterval: 30000
})

expectAssignable<SnapshotRecorder.Options>({
  maxSnapshots: 50,
  flushInterval: 15000
})
