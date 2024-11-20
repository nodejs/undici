import { Readable, Writable } from 'node:stream'

export default CacheHandler

declare namespace CacheHandler {
  export type CacheMethods = 'GET' | 'HEAD' | 'OPTIONS' | 'TRACE'

  export interface CacheOptions {
    store?: CacheStore

    /**
     * The methods to cache
     * Note we can only cache safe methods. Unsafe methods (i.e. PUT, POST)
     *  invalidate the cache for a origin.
     * @see https://www.rfc-editor.org/rfc/rfc9111.html#name-invalidating-stored-respons
     * @see https://www.rfc-editor.org/rfc/rfc9110#section-9.2.1
     */
    methods?: CacheMethods[]
  }

  export interface CacheKey {
    origin: string
    method: string
    path: string
    headers?: Record<string, string | string[]>
  }

  export interface CacheValue {
    statusCode: number
    statusMessage: string
    rawHeaders: Buffer[]
    vary?: Record<string, string | string[]>
    etag?: string
    cachedAt: number
    staleAt: number
    deleteAt: number
  }

  export interface DeleteByUri {
    origin: string
    method: string
    path: string
  }

  type GetResult = {
    statusCode: number
    statusMessage: string
    rawHeaders: Buffer[]
    body: null | Readable | Iterable<Buffer> | AsyncIterable<Buffer> | Buffer | Iterable<string> | AsyncIterable<string> | string
    cachedAt: number
    staleAt: number
    deleteAt: number
  }

  /**
   * Underlying storage provider for cached responses
   */
  export interface CacheStore {
    get(key: CacheKey): GetResult | Promise<GetResult | undefined> | undefined

    createWriteStream(key: CacheKey, val: CacheValue): Writable | undefined

    delete(key: CacheKey): void | Promise<void>
  }

  export interface MemoryCacheStoreOpts {
    /**
       * @default Infinity
       */
    maxCount?: number

    /**
       * @default Infinity
       */
    maxSize?: number

    /**
       * @default Infinity
       */
    maxEntrySize?: number

    errorCallback?: (err: Error) => void
  }

  export class MemoryCacheStore implements CacheStore {
    constructor (opts?: MemoryCacheStoreOpts)

    get (key: CacheKey): GetResult | Promise<GetResult | undefined> | undefined

    createWriteStream (key: CacheKey, value: CacheValue): Writable | undefined

    delete (key: CacheKey): void | Promise<void>
  }
}
