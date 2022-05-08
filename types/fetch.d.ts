// based on https://github.com/Ethan-Arrowood/undici-fetch/blob/249269714db874351589d2d364a0645d5160ae71/index.d.ts (MIT license)
// and https://github.com/node-fetch/node-fetch/blob/914ce6be5ec67a8bab63d68510aabf07cb818b6d/index.d.ts (MIT license)
/// <reference types="node" />

import { Blob } from 'buffer'
import { URL, URLSearchParams } from 'url'
import { ReadableStream } from 'stream/web'
import { FormData } from './formdata'

import Dispatcher = require('./dispatcher')

export type RequestInfo = string | URL | Request

export declare function fetch (
  input: RequestInfo,
  init?: RequestInit
): Promise<Response>

export type BodyInit =
  | ArrayBuffer
  | AsyncIterable<Uint8Array>
  | Blob
  | FormData
  | Iterable<Uint8Array>
  | NodeJS.ArrayBufferView
  | URLSearchParams
  | null
  | string

export interface BodyMixin {
  readonly body: ReadableStream | null
  readonly bodyUsed: boolean

  readonly arrayBuffer: () => Promise<ArrayBuffer>
  readonly blob: () => Promise<Blob>
  readonly formData: () => Promise<FormData>
  readonly json: () => Promise<unknown>
  readonly text: () => Promise<string>
}

export interface HeadersIterator<T, TReturn = any, TNext = undefined> {
  next(...args: [] | [TNext]): IteratorResult<T, TReturn>;
}

export interface HeadersIterableIterator<T> extends HeadersIterator<T> {
  [Symbol.iterator](): HeadersIterableIterator<T>;
}

export interface HeadersIterable<T> {
  [Symbol.iterator](): HeadersIterator<T>;
}

export type HeadersInit = string[][] | Record<string, string | ReadonlyArray<string>> | Headers

export declare class Headers implements HeadersIterable<[string, string]> {
  constructor (init?: HeadersInit)
  readonly append: (name: string, value: string) => void
  readonly delete: (name: string) => void
  readonly get: (name: string) => string | null
  readonly has: (name: string) => boolean
  readonly set: (name: string, value: string) => void
  readonly forEach: (
    callbackfn: (value: string, key: string, iterable: Headers) => void,
    thisArg?: unknown
  ) => void

  readonly keys: () => HeadersIterableIterator<string>
  readonly values: () => HeadersIterableIterator<string>
  readonly entries: () => HeadersIterableIterator<[string, string]>
  readonly [Symbol.iterator]: () => HeadersIterator<[string, string]>
}

export type RequestCache =
  | 'default'
  | 'force-cache'
  | 'no-cache'
  | 'no-store'
  | 'only-if-cached'
  | 'reload'

export type RequestCredentials = 'omit' | 'include' | 'same-origin'

type RequestDestination =
  | ''
  | 'audio'
  | 'audioworklet'
  | 'document'
  | 'embed'
  | 'font'
  | 'image'
  | 'manifest'
  | 'object'
  | 'paintworklet'
  | 'report'
  | 'script'
  | 'sharedworker'
  | 'style'
  | 'track'
  | 'video'
  | 'worker'
  | 'xslt'

export interface RequestInit {
  readonly method?: string
  readonly keepalive?: boolean
  readonly headers?: HeadersInit
  readonly body?: BodyInit
  readonly redirect?: RequestRedirect
  readonly integrity?: string
  readonly signal?: AbortSignal
  readonly credentials?: RequestCredentials
  readonly mode?: RequestMode
  readonly referrer?: string
  readonly referrerPolicy?: ReferrerPolicy
  readonly window?: null
  readonly dispatcher?: Dispatcher
}

export type ReferrerPolicy =
  | ''
  | 'no-referrer'
  | 'no-referrer-when-downgrade'
  | 'origin'
  | 'origin-when-cross-origin'
  | 'same-origin'
  | 'strict-origin'
  | 'strict-origin-when-cross-origin'
  | 'unsafe-url';

export type RequestMode = 'cors' | 'navigate' | 'no-cors' | 'same-origin'

export type RequestRedirect = 'error' | 'follow' | 'manual'

export declare class Request implements BodyMixin {
  constructor (input: RequestInfo, init?: RequestInit)

  readonly cache: RequestCache
  readonly credentials: RequestCredentials
  readonly destination: RequestDestination
  readonly headers: Headers
  readonly integrity: string
  readonly method: string
  readonly mode: RequestMode
  readonly redirect: RequestRedirect
  readonly referrerPolicy: string
  readonly url: string

  readonly keepalive: boolean
  readonly signal: AbortSignal

  readonly body: ReadableStream | null
  readonly bodyUsed: boolean

  readonly arrayBuffer: () => Promise<ArrayBuffer>
  readonly blob: () => Promise<Blob>
  readonly formData: () => Promise<FormData>
  readonly json: () => Promise<unknown>
  readonly text: () => Promise<string>

  readonly clone: () => Request
}

export interface ResponseInit {
  readonly status?: number
  readonly statusText?: string
  readonly headers?: HeadersInit
}

export type ResponseType =
  | 'basic'
  | 'cors'
  | 'default'
  | 'error'
  | 'opaque'
  | 'opaqueredirect'

export type ResponseRedirectStatus = 301 | 302 | 303 | 307 | 308

export declare class Response implements BodyMixin {
  constructor (body?: BodyInit, init?: ResponseInit)

  readonly headers: Headers
  readonly ok: boolean
  readonly status: number
  readonly statusText: string
  readonly type: ResponseType
  readonly url: string
  readonly redirected: boolean

  readonly body: ReadableStream | null
  readonly bodyUsed: boolean

  readonly arrayBuffer: () => Promise<ArrayBuffer>
  readonly blob: () => Promise<Blob>
  readonly formData: () => Promise<FormData>
  readonly json: () => Promise<unknown>
  readonly text: () => Promise<string>

  readonly clone: () => Response

  static error (): Response
  static redirect (url: string | URL, status: ResponseRedirectStatus): Response
}
