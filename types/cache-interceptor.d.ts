import { Readable, Writable } from 'node:stream'
import Dispatcher from './dispatcher'

export default CacheHandler

declare namespace CacheHandler {
  export interface CacheOptions {
    store?: CacheStore

    /**
     * The methods to cache
     * Note we can only cache safe methods. Unsafe methods (i.e. PUT, POST)
     *  invalidate the cache for a origin.
     * @see https://www.rfc-editor.org/rfc/rfc9111.html#name-invalidating-stored-respons
     * @see https://www.rfc-editor.org/rfc/rfc9110#section-9.2.1
     */
    methods?: ('GET' | 'HEAD' | 'OPTIONS' | 'TRACE')[]
  }

  /**
   * Underlying storage provider for cached responses
   */
  export interface CacheStore {
    /**
     * Whether or not the cache is full and can not store any more responses
     */
    get isFull(): boolean

    createReadStream(req: Dispatcher.RequestOptions): CacheStoreReadable | Promise<CacheStoreReadable | undefined> | undefined

    createWriteStream(req: Dispatcher.RequestOptions, value: Omit<CacheStoreValue, 'rawTrailers'>): CacheStoreWriteable | undefined

    /**
     * Delete all of the cached responses from a certain origin (host)
     */
    deleteByOrigin(origin: string): void | Promise<void>
  }

  export interface CacheStoreReadable extends Readable {
    get value(): CacheStoreValue
  }

  export interface CacheStoreWriteable extends Writable {
    set rawTrailers(rawTrailers: string[] | undefined)
  }

  export interface CacheStoreValue {
    statusCode: number;
    statusMessage: string;
    rawHeaders: (Buffer | Buffer[])[];
    rawTrailers?: string[];
    /**
     * Headers defined by the Vary header and their respective values for
     *  later comparison
     */
    vary?: Record<string, string>;
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
  }

  export class MemoryCacheStore implements CacheStore {
    constructor (opts?: MemoryCacheStoreOpts)

    get isFull (): boolean

    createReadStream (req: Dispatcher.RequestOptions): CacheStoreReadable | undefined

    createWriteStream (req: Dispatcher.RequestOptions, value: CacheStoreValue): CacheStoreWriteable

    deleteByOrigin (origin: string): void
  }
}
