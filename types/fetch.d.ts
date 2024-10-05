// based on https://github.com/Ethan-Arrowood/undici-fetch/blob/249269714db874351589d2d364a0645d5160ae71/index.d.ts (MIT license)
// and https://github.com/node-fetch/node-fetch/blob/914ce6be5ec67a8bab63d68510aabf07cb818b6d/index.d.ts (MIT license)
/// <reference types="node" />

import { Blob } from 'buffer'
import { URL, URLSearchParams } from 'url'
import { ReadableStream } from 'stream/web'
import { FormData } from './formdata'
import { HeaderRecord } from './header'
import Dispatcher from './dispatcher'

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

export class BodyMixin {
  readonly body: ReadableStream | null
  readonly bodyUsed: boolean

  readonly arrayBuffer: () => Promise<ArrayBuffer>
  readonly blob: () => Promise<Blob>
  /**
   * @deprecated This method is not recommended for parsing multipart/form-data bodies in server environments.
   * It is recommended to use a library such as [@fastify/busboy](https://www.npmjs.com/package/@fastify/busboy) as follows:
   *
   * @example
   * ```js
   * import { Busboy } from '@fastify/busboy'
   * import { Readable } from 'node:stream'
   *
   * const response = await fetch('...')
   * const busboy = new Busboy({ headers: { 'content-type': response.headers.get('content-type') } })
   *
   * // handle events emitted from `busboy`
   *
   * Readable.fromWeb(response.body).pipe(busboy)
   * ```
   */
  readonly formData: () => Promise<FormData>
  readonly json: () => Promise<unknown>
  readonly text: () => Promise<string>
}

/**
 * Describes a user-defined {@link Iterator} that is also iterable.
 */
interface IterableIterator<T, TReturn = any, TNext = any> extends Iterator<T, TReturn, TNext> {
  [Symbol.iterator](): IterableIterator<T, TReturn, TNext>;
}

/**
* Describes an {@link Iterator} produced by the runtime that inherits from the intrinsic `Iterator.prototype`.
*/
interface IteratorObject<T, TReturn = unknown, TNext = unknown> extends Iterator<T, TReturn, TNext> {
  [Symbol.iterator](): IteratorObject<T, TReturn, TNext>;
}

/**
* Defines the `TReturn` type used for built-in iterators produced by `Array`, `Map`, `Set`, and others.
* This is `undefined` when `strictBuiltInIteratorReturn` is `true`; otherwise, this is `any`.
*/
type BuiltinIteratorReturn = undefined

interface HeadersIterator<T> extends IteratorObject<T, BuiltinIteratorReturn, unknown> {
  [Symbol.iterator](): HeadersIterator<T>;
}

export type HeadersInit = [string, string][] | HeaderRecord | Headers

export declare class Headers {
  constructor (init?: HeadersInit)
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Headers/append) */
  append (name: string, value: string): void
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Headers/delete) */
  delete (name: string): void
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Headers/get) */
  get (name: string): string | null
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Headers/getSetCookie) */
  getSetCookie (): string[]
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Headers/has) */
  has (name: string): boolean
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Headers/set) */
  set (name: string, value: string): void
  forEach (
    callbackfn: (value: string, key: string, parent: Headers) => void,
    thisArg?: any
  ): void

  [Symbol.iterator] (): HeadersIterator<[string, string]>
  /** Returns an iterator allowing to go through all key/value pairs contained in this object. */
  entries (): HeadersIterator<[string, string]>
  /** Returns an iterator allowing to go through all keys of the key/value pairs contained in this object. */
  keys (): HeadersIterator<string>
  /** Returns an iterator allowing to go through all values of the key/value pairs contained in this object. */
  values (): HeadersIterator<string>
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
  method?: string
  keepalive?: boolean
  headers?: HeadersInit
  body?: BodyInit | null
  redirect?: RequestRedirect
  integrity?: string
  signal?: AbortSignal | null
  credentials?: RequestCredentials
  mode?: RequestMode
  referrer?: string
  referrerPolicy?: ReferrerPolicy
  window?: null
  dispatcher?: Dispatcher
  duplex?: RequestDuplex
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
  | 'unsafe-url'

export type RequestMode = 'cors' | 'navigate' | 'no-cors' | 'same-origin'

export type RequestRedirect = 'error' | 'follow' | 'manual'

export type RequestDuplex = 'half'

export declare class Request extends BodyMixin {
  constructor (input: RequestInfo, init?: RequestInit)

  readonly cache: RequestCache
  readonly credentials: RequestCredentials
  readonly destination: RequestDestination
  readonly headers: Headers
  readonly integrity: string
  readonly method: string
  readonly mode: RequestMode
  readonly redirect: RequestRedirect
  readonly referrer: string
  readonly referrerPolicy: ReferrerPolicy
  readonly url: string

  readonly keepalive: boolean
  readonly signal: AbortSignal
  readonly duplex: RequestDuplex

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

export declare class Response extends BodyMixin {
  constructor (body?: BodyInit, init?: ResponseInit)

  readonly headers: Headers
  readonly ok: boolean
  readonly status: number
  readonly statusText: string
  readonly type: ResponseType
  readonly url: string
  readonly redirected: boolean

  readonly clone: () => Response

  static error (): Response
  static json (data: any, init?: ResponseInit): Response
  static redirect (url: string | URL, status: ResponseRedirectStatus): Response
}
