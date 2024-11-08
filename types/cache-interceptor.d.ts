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

  export interface DeleteByUri {
    origin: string
    method: string
    path: string
  }

  export interface GetValueByKeyResult {
    response: CachedResponse
    body?: Readable
  }

  /**
   * Underlying storage provider for cached responses
   */
  export interface CacheStore {
    /**
     * Whether or not the cache is full and can not store any more responses
     */
    get isFull(): boolean | undefined

    getValueByKey(key: CacheKey): GetValueByKeyResult | Promise<GetValueByKeyResult | undefined> | undefined

    createWriteStream(key: CacheKey, value: CachedResponse): Writable | undefined

    deleteByKey(key: CacheKey): void | Promise<void>;
  }

  export interface CachedResponse {
    statusCode: number;
    statusMessage: string;
    rawHeaders: Buffer[];
    /**
     * Headers defined by the Vary header and their respective values for
     *  later comparison
     */
    vary?: Record<string, string | string[]>;
    /**
     * Time in millis that this value was cached
     */
    cachedAt: number;
    /**
     * Time in millis that this value is considered stale
     */
    staleAt: number;
    /**
     * Time in millis that this value is to be deleted from the cache. This is
     *  either the same as staleAt or the `max-stale` caching directive.
     */
    deleteAt: number;
  }

  export interface MemoryCacheStoreOpts {
    /**
       * @default Infinity
       */
    maxEntries?: number
    /**
       * @default Infinity
       */
    maxEntrySize?: number
    errorCallback?: (err: Error) => void
  }

  export class MemoryCacheStore implements CacheStore {
    constructor (opts?: MemoryCacheStoreOpts)

    get isFull (): boolean

    getValueByKey (key: CacheKey): GetValueByKeyResult | Promise<GetValueByKeyResult | undefined> | undefined

    createWriteStream (key: CacheKey, value: CachedResponse): Writable | undefined

    deleteByKey (uri: DeleteByUri): void
  }
}
