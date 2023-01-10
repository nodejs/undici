// @ts-check

/// <reference types="node" />

import { Writable, Readable } from 'stream'
import { IncomingHttpHeaders } from 'http'
import { Headers } from './fetch'

export interface FormDataParserConfig {
  headers: IncomingHttpHeaders | Headers
  highWaterMark?: number
  fileHwm?: number
  defCharset?: string
  defParamCharset?: string
  preservePath?: boolean
  limits?: {
    fieldNameSize?: number
    fieldSize?: number
    fields?: number
    fileSize?: number
    files?: number
    parts?: number
    headerPairs?: number
  }
}

interface FormDataParserErrors {
  file: (
    name: string,
    stream: Readable,
    info: {
      fileName: string,
      stream: FileStream,
      info: {
        filename: string,
        encoding: string,
        mimeType: string
      }
    }
  ) => void

  field: (
    name: string,
    value: string,
    info: {
      name: string,
      data: string,
      info: {
        nameTruncated: boolean,
        valueTruncated: boolean,
        encoding: string,
        mimeType: string
      }
    }
  ) => void

  partsLimit: () => void

  filesLimit: () => void

  fieldsLimit: () => void

  limit: () => void

  error: (error: Error) => void

  close: () => void
}

export declare class FileStream extends Readable {}

export declare class FormDataParser extends Writable {
  constructor (opts: FormDataParserConfig)

  private run (cb: (err?: Error) => void): void

  addListener<
    T extends keyof FormDataParserErrors
  >(event: T, listener: FormDataParserErrors[T]): this
  addListener(event: string | symbol, listener: (...args: any[]) => void): this

  on<
    T extends keyof FormDataParserErrors
  >(event: T, listener: FormDataParserErrors[T]): this
  on(event: string | symbol, listener: (...args: any[]) => void): this

  once<
    T extends keyof FormDataParserErrors
  >(event: T, listener: FormDataParserErrors[T]): this
  once(event: string | symbol, listener: (...args: any[]) => void): this

  removeListener<
    T extends keyof FormDataParserErrors
  >(event: T, listener: FormDataParserErrors[T]): this
  removeListener(event: string | symbol, listener: (...args: any[]) => void): this

  off<
    T extends keyof FormDataParserErrors
  >(event: T, listener: FormDataParserErrors[T]): this
  off(event: string | symbol, listener: (...args: any[]) => void): this

  prependListener<
    T extends keyof FormDataParserErrors
  >(event: T, listener: FormDataParserErrors[T]): this
  prependListener(event: string | symbol, listener: (...args: any[]) => void): this

  prependOnceListener<
    T extends keyof FormDataParserErrors
  >(event: T, listener: FormDataParserErrors[T]): this
  prependOnceListener(event: string | symbol, listener: (...args: any[]) => void): this
}
