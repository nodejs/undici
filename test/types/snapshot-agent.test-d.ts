import { expectAssignable, expectType } from 'tsd'
import { Agent, Dispatcher, MockAgent, SnapshotAgent, setGlobalDispatcher } from '../..'
import { SnapshotRecorder } from '../../types/snapshot-agent'

// Constructor tests
expectAssignable<SnapshotAgent>(new SnapshotAgent())
expectAssignable<SnapshotAgent>(new SnapshotAgent({}))
expectAssignable<SnapshotAgent>(new SnapshotAgent({ mode: 'record' }))
expectAssignable<SnapshotAgent>(new SnapshotAgent({ mode: 'playback' }))
expectAssignable<SnapshotAgent>(new SnapshotAgent({ mode: 'update' }))
expectAssignable<SnapshotAgent>(new SnapshotAgent({ snapshotPath: './snapshots.json' }))
expectAssignable<SnapshotAgent>(new SnapshotAgent({
  mode: 'record',
  snapshotPath: './snapshots.json'
}))

// SnapshotAgent extends MockAgent
expectAssignable<MockAgent>(new SnapshotAgent())
expectAssignable<Dispatcher>(new SnapshotAgent())

{
  const snapshotAgent = new SnapshotAgent()
  expectAssignable<void>(setGlobalDispatcher(snapshotAgent))

  // Snapshot-specific methods
  expectType<Promise<void>>(snapshotAgent.saveSnapshots())
  expectType<Promise<void>>(snapshotAgent.saveSnapshots('./custom.json'))
  expectType<Promise<void>>(snapshotAgent.loadSnapshots())
  expectType<Promise<void>>(snapshotAgent.loadSnapshots('./custom.json'))
  expectType<SnapshotRecorder>(snapshotAgent.getRecorder())
  expectType<'record' | 'playback' | 'update'>(snapshotAgent.getMode())
  expectType<void>(snapshotAgent.clearSnapshots())

  // Inherited MockAgent methods
  expectType<Promise<void>>(snapshotAgent.close())
  expectType<void>(snapshotAgent.deactivate())
  expectType<void>(snapshotAgent.activate())
  expectType<void>(snapshotAgent.enableNetConnect())
  expectType<void>(snapshotAgent.disableNetConnect())
}

{
  // Constructor with all MockAgent options
  const snapshotAgent = new SnapshotAgent({
    mode: 'playback',
    snapshotPath: './test.json',
    connections: 1,
    enableCallHistory: true,
    acceptNonStandardSearchParameters: true
  })

  expectAssignable<SnapshotAgent>(snapshotAgent)
}

{
  // Constructor with agent option
  const agent = new Agent()
  const snapshotAgent = new SnapshotAgent({
    mode: 'record',
    agent
  })

  expectAssignable<SnapshotAgent>(snapshotAgent)
}

{
  // SnapshotRecorder standalone usage
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
}

{
  // SnapshotRecorder with options
  const recorder = new SnapshotRecorder({
    snapshotPath: './test.json',
    mode: 'record'
  })

  expectAssignable<SnapshotRecorder>(recorder)
}

{
  // Snapshot type structure
  const snapshot: SnapshotRecorder.Snapshot = {
    request: {
      method: 'GET',
      url: 'https://api.example.com/test',
      headers: { authorization: 'Bearer token' },
      body: '{"test": "data"}'
    },
    response: {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: 'eyJ0ZXN0IjoiZGF0YSJ9', // base64
      trailers: {}
    },
    timestamp: '2024-01-01T00:00:00.000Z'
  }

  expectType<string>(snapshot.request.method)
  expectType<string>(snapshot.request.url)
  expectType<Record<string, string>>(snapshot.request.headers)
  expectType<string | undefined>(snapshot.request.body)
  expectType<number>(snapshot.response.statusCode)
  expectType<Record<string, string>>(snapshot.response.headers)
  expectType<string>(snapshot.response.body)
  expectType<Record<string, string>>(snapshot.response.trailers)
  expectType<string>(snapshot.timestamp)
}
