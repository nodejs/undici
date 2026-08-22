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
  resetCallCounts (): void
  deleteSnapshot (requestOpts: any): boolean
  getSnapshotInfo (requestOpts: any): SnapshotRecorder.SnapshotInfo | null
  replaceSnapshots (snapshotData: SnapshotRecorder.SnapshotData[]): void
  destroy (): void
}

declare namespace SnapshotRecorder {
  type SnapshotRecorderMode = 'record' | 'playback' | 'update'

  export interface Options {
    snapshotPath?: string | undefined
    mode?: SnapshotRecorderMode | undefined
    maxSnapshots?: number | undefined
    autoFlush?: boolean | undefined
    flushInterval?: number | undefined
    matchHeaders?: string[] | undefined
    ignoreHeaders?: string[] | undefined
    excludeHeaders?: string[] | undefined
    matchBody?: boolean | undefined
    normalizeBody?: ((body: string | Buffer | null | undefined) => string) | undefined
    matchQuery?: boolean | undefined
    normalizeQuery?: ((query: URLSearchParams) => string) | undefined
    caseSensitive?: boolean | undefined
    shouldRecord?: ((requestOpts: any) => boolean) | undefined
    shouldPlayback?: ((requestOpts: any) => boolean) | undefined
    excludeUrls?: (string | RegExp)[] | undefined
  }

  export interface Snapshot {
    request: {
      method: string
      url: string
      headers: Record<string, string>
      body?: string | undefined
    }
    responses: {
      statusCode: number
      headers: Record<string, string>
      body: string
      trailers: Record<string, string>
    }[]
    callCount: number
    timestamp: string
  }

  export interface SnapshotInfo {
    hash: string
    request: {
      method: string
      url: string
      headers: Record<string, string>
      body?: string | undefined
    }
    responseCount: number
    callCount: number
    timestamp: string
  }

  export interface SnapshotData {
    hash: string
    snapshot: Snapshot
  }
}

declare class SnapshotAgent extends MockAgent {
  constructor (options?: SnapshotAgent.Options)

  saveSnapshots (filePath?: string): Promise<void>
  loadSnapshots (filePath?: string): Promise<void>
  getRecorder (): SnapshotRecorder
  getMode (): SnapshotRecorder.SnapshotRecorderMode
  clearSnapshots (): void
  resetCallCounts (): void
  deleteSnapshot (requestOpts: any): boolean
  getSnapshotInfo (requestOpts: any): SnapshotRecorder.SnapshotInfo | null
  replaceSnapshots (snapshotData: SnapshotRecorder.SnapshotData[]): void
}

declare namespace SnapshotAgent {
  export interface Options extends MockAgent.Options {
    mode?: SnapshotRecorder.SnapshotRecorderMode | undefined
    snapshotPath?: string | undefined
    maxSnapshots?: number | undefined
    autoFlush?: boolean | undefined
    flushInterval?: number | undefined
    matchHeaders?: string[] | undefined
    ignoreHeaders?: string[] | undefined
    excludeHeaders?: string[] | undefined
    matchBody?: boolean | undefined
    normalizeBody?: ((body: string | Buffer | null | undefined) => string) | undefined
    matchQuery?: boolean | undefined
    normalizeQuery?: ((query: URLSearchParams) => string) | undefined
    caseSensitive?: boolean | undefined
    shouldRecord?: ((requestOpts: any) => boolean) | undefined
    shouldPlayback?: ((requestOpts: any) => boolean) | undefined
    excludeUrls?: (string | RegExp)[] | undefined
  }
}

export { SnapshotAgent, SnapshotRecorder }
