import { Readable, Writable } from 'node:stream'

export default CacheHandler

declare namespace CacheHandler {
  export type CacheMethods = 'GET' | 'HEAD' | 'OPTIONS' | 'TRACE'

  export interface CacheHandlerOptions {
    store: CacheStore

    cacheByDefault?: number | undefined

    type?: CacheOptions['type'] | undefined
  }

  export interface CacheOptions {
    store?: CacheStore | undefined

    /**
     * The methods to cache
     * Note we can only cache safe methods. Unsafe methods (i.e. PUT, POST)
     *  invalidate the cache for a origin.
     * @see https://www.rfc-editor.org/rfc/rfc9111.html#name-invalidating-stored-respons
     * @see https://www.rfc-editor.org/rfc/rfc9110#section-9.2.1
     */
    methods?: CacheMethods[] | undefined

    /**
     * RFC9111 allows for caching responses that we aren't explicitly told to
     *  cache or to not cache.
     * @see https://www.rfc-editor.org/rfc/rfc9111.html#section-3-5
     * @default undefined
     */
    cacheByDefault?: number | undefined

    /**
     * TODO docs
     * @default 'shared'
     */
    type?: 'shared' | 'private' | undefined

    /**
     * Array of origins to cache. Only requests to these origins will be cached.
     * Supports strings (case insensitive) and RegExp patterns.
     * @default undefined (cache all origins)
     */
    origins?: (string | RegExp)[] | undefined
  }

  export interface CacheControlDirectives {
    'max-stale'?: number | undefined;
    'min-fresh'?: number | undefined;
    'max-age'?: number | undefined;
    's-maxage'?: number | undefined;
    'stale-while-revalidate'?: number | undefined;
    'stale-if-error'?: number | undefined;
    public?: true | undefined;
    private?: true | string[] | undefined;
    'no-store'?: true | undefined;
    'no-cache'?: true | string[] | undefined;
    'must-revalidate'?: true | undefined;
    'proxy-revalidate'?: true | undefined;
    immutable?: true | undefined;
    'no-transform'?: true | undefined;
    'must-understand'?: true | undefined;
    'only-if-cached'?: true | undefined;
  }

  export interface CacheKey {
    origin: string
    method: string
    path: string
    headers?: Record<string, string | string[]> | undefined
  }

  export interface CacheValue {
    statusCode: number
    statusMessage: string
    headers: Record<string, string | string[]>
    vary?: Record<string, string | string[] | null> | undefined
    etag?: string | undefined
    cacheControlDirectives?: CacheControlDirectives | undefined
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
    headers: Record<string, string | string[]>
    vary?: Record<string, string | string[] | null> | undefined
    etag?: string | undefined
    body?: Readable | Iterable<Buffer> | AsyncIterable<Buffer> | Buffer | Iterable<string> | AsyncIterable<string> | string | undefined
    cacheControlDirectives: CacheControlDirectives,
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
    maxCount?: number | undefined

    /**
     * @default Infinity
     */
    maxSize?: number | undefined

    /**
     * @default Infinity
     */
    maxEntrySize?: number | undefined

    errorCallback?: ((err: Error) => void) | undefined
  }

  export class MemoryCacheStore implements CacheStore {
    constructor (opts?: MemoryCacheStoreOpts)

    get (key: CacheKey): GetResult | Promise<GetResult | undefined> | undefined

    createWriteStream (key: CacheKey, value: CacheValue): Writable | undefined

    delete (key: CacheKey): void | Promise<void>
  }

  export interface SqliteCacheStoreOpts {
    /**
     * Location of the database
     * @default ':memory:'
     */
    location?: string | undefined

    /**
     * @default Infinity
     */
    maxCount?: number | undefined

    /**
     * @default Infinity
     */
    maxEntrySize?: number | undefined
  }

  export class SqliteCacheStore implements CacheStore {
    constructor (opts?: SqliteCacheStoreOpts)

    /**
     * Closes the connection to the database
     */
    close (): void

    get (key: CacheKey): GetResult | Promise<GetResult | undefined> | undefined

    createWriteStream (key: CacheKey, value: CacheValue): Writable | undefined

    delete (key: CacheKey): void | Promise<void>
  }
}
