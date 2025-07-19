import MockAgent from './mock-agent'

declare class SnapshotRecorder {
  constructor (options?: SnapshotRecorder.Options)

  record (requestOpts: any, response: any): Promise<void>
  findSnapshot (requestOpts: any): SnapshotRecorder.Snapshot | undefined
  loadSnapshots (filePath?: string): Promise<void>
  saveSnapshots (filePath?: string): Promise<void>
  clear (): void
  getSnapshots (): SnapshotRecorder.Snapshot[]
  size (): number
}

declare namespace SnapshotRecorder {
  export interface Options {
    snapshotPath?: string
    mode?: 'record' | 'playback' | 'update'
  }

  export interface Snapshot {
    request: {
      method: string
      url: string
      headers: Record<string, string>
      body?: string
    }
    response: {
      statusCode: number
      headers: Record<string, string>
      body: string
      trailers: Record<string, string>
    }
    timestamp: string
  }
}

declare class SnapshotAgent extends MockAgent {
  constructor (options?: SnapshotAgent.Options)

  saveSnapshots (filePath?: string): Promise<void>
  loadSnapshots (filePath?: string): Promise<void>
  getRecorder (): SnapshotRecorder
  getMode (): 'record' | 'playback' | 'update'
  clearSnapshots (): void
}

declare namespace SnapshotAgent {
  export interface Options extends MockAgent.Options {
    mode?: 'record' | 'playback' | 'update'
    snapshotPath?: string
  }
}

export { SnapshotAgent, SnapshotRecorder }
