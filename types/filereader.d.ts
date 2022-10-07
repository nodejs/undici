/// <reference types="node" />

import { Blob } from 'buffer'

export declare class FileReader extends EventTarget {
  constructor ()

  readAsArrayBuffer (blob: Blob): void
  readAsBinaryString (blob: Blob): void
  readAsText (blob: Blob, encoding?: string): void
  readAsDataURL (blob: Blob): void

  abort (): void

  static readonly EMPTY = 0
  static readonly LOADING = 1
  static readonly DONE = 2

  readonly EMPTY = 0
  readonly LOADING = 1
  readonly DONE = 2

  readonly readyState: number

  readonly result: string | ArrayBuffer

  readonly error: DOMException

  onloadstart? (this: FileReader, event: ProgressEvent): void
  onprogress? (this: FileReader, event: ProgressEvent): void
  onload? (this: FileReader, event: ProgressEvent): void
  onabort? (this: FileReader, event: ProgressEvent): void
  onerror? (this: FileReader, event: ProgressEvent): void
  onloadend? (this: FileReader, event: ProgressEvent): void
}

export interface ProgressEventInit extends EventInit {
  lengthComputable?: boolean
  loaded?: number
  total?: number
}

export declare class ProgressEvent extends Event {
  constructor (type: string, eventInitDict?: ProgressEventInit)

  readonly lengthComputable: boolean
  readonly loaded: number
  readonly total: number
}