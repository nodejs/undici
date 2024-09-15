import Dispatcher from './dispatcher'

export default CacheHandler

declare namespace CacheHandler {
  export interface CacheOptions {
    store?: CacheStore

    /**
     * The methods to cache, defaults to just GET
     */
    methods?: ('GET' | 'HEAD' | 'POST' | 'PATCH')[]
  }

  /**
   * Underlying storage provider for cached responses
   */
  export interface CacheStore {
    /**
     * The max size of each value. If the content-length header is greater than
     *  this or the response ends up over this, the response will not be cached
     * @default Infinity
     */
    get maxEntrySize(): number

    get(key: Dispatcher.RequestOptions): CacheStoreValue | Promise<CacheStoreValue>;

    put(key: Dispatcher.RequestOptions, opts: CacheStoreValue): void | Promise<void>;
  }

  export interface CacheStoreValue {
    /**
     * True if the response is complete, otherwise the request is still in-flight
     */
    complete: boolean;
    statusCode: number;
    statusMessage: string;
    rawHeaders: Buffer[];
    rawTrailers?: Buffer[];
    body: string[]
    /**
     * Headers defined by the Vary header and their respective values for
     *  later comparison
     */
    vary?: Record<string, string>;
    /**
     * Actual size of the response (i.e. size of headers + body + trailers)
     */
    size: number;
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
    maxEntrySize?: number
  }

  export class MemoryCacheStore implements CacheStore {
    constructor (opts?: MemoryCacheStoreOpts)

    get maxEntrySize (): number
    get (key: Dispatcher.RequestOptions): CacheStoreValue | Promise<CacheStoreValue>
    put (key: Dispatcher.RequestOptions, opts: CacheStoreValue): Promise<void>
  }
}
