import CacheHandler from './cache-interceptor'
import Dispatcher from './dispatcher'
import RetryHandler from './retry-handler'
import { LookupOptions } from 'node:dns'

export default Interceptors

declare namespace Interceptors {
  export type DumpInterceptorOpts = { maxSize?: number | undefined }
  export type RetryInterceptorOpts = RetryHandler.RetryOptions
  export type RedirectInterceptorOpts = { maxRedirections?: number | undefined, throwOnMaxRedirect?: boolean | undefined, stripHeadersOnRedirect?: string[] | undefined, stripHeadersOnCrossOriginRedirect?: string[] | undefined }
  export type DecompressInterceptorOpts = {
    skipErrorResponses?: boolean | undefined
    skipStatusCodes?: number[] | undefined
  }

  export type ResponseErrorInterceptorOpts = { throwOnError: boolean }
  export type CacheInterceptorOpts = CacheHandler.CacheOptions

  // DNS interceptor
  export type DNSInterceptorRecord = { address: string, ttl: number, family: 4 | 6 }
  export type DNSInterceptorOriginRecords = { records: { 4: { ips: DNSInterceptorRecord[] } | null, 6: { ips: DNSInterceptorRecord[] } | null } }
  export type DNSStorage = {
    size: number
    get(origin: string): DNSInterceptorOriginRecords | null
    set(origin: string, records: DNSInterceptorOriginRecords | null, options: { ttl: number }): void
    delete(origin: string): void
    full(): boolean
  }
  export type DNSInterceptorOpts = {
    maxTTL?: number | undefined
    maxItems?: number | undefined
    lookup?: ((origin: URL, options: LookupOptions, callback: (err: NodeJS.ErrnoException | null, addresses: DNSInterceptorRecord[]) => void) => void) | undefined
    pick?: ((origin: URL, records: DNSInterceptorOriginRecords, affinity: 4 | 6) => DNSInterceptorRecord) | undefined
    dualStack?: boolean | undefined
    affinity?: 4 | 6 | undefined
    storage?: DNSStorage | undefined
  }

  // Deduplicate interceptor
  export type DeduplicateMethods = 'GET' | 'HEAD' | 'OPTIONS' | 'TRACE'
  export type DeduplicateInterceptorOpts = {
    /**
     * The HTTP methods to deduplicate.
     * Note: Only safe HTTP methods can be deduplicated.
     * @default ['GET']
     */
    methods?: DeduplicateMethods[] | undefined
    /**
     * Header names that, if present in a request, will cause the request to skip deduplication.
     * Header name matching is case-insensitive.
     * @default []
     */
    skipHeaderNames?: string[] | undefined
    /**
     * Header names to exclude from the deduplication key.
     * Requests with different values for these headers will still be deduplicated together.
     * Useful for headers like `x-request-id` that vary per request but shouldn't affect deduplication.
     * Header name matching is case-insensitive.
     * @default []
     */
    excludeHeaderNames?: string[] | undefined
    /**
     * Maximum bytes buffered per paused waiting deduplicated handler.
     * If a waiting handler remains paused and exceeds this threshold,
     * it is failed with an abort error to prevent unbounded memory growth.
     * @default 5 * 1024 * 1024
     */
    maxBufferSize?: number | undefined
  }

  export function dump (opts?: DumpInterceptorOpts): Dispatcher.DispatcherComposeInterceptor
  export function retry (opts?: RetryInterceptorOpts): Dispatcher.DispatcherComposeInterceptor
  export function redirect (opts?: RedirectInterceptorOpts): Dispatcher.DispatcherComposeInterceptor
  export function decompress (opts?: DecompressInterceptorOpts): Dispatcher.DispatcherComposeInterceptor
  export function responseError (opts?: ResponseErrorInterceptorOpts): Dispatcher.DispatcherComposeInterceptor
  export function dns (opts?: DNSInterceptorOpts): Dispatcher.DispatcherComposeInterceptor
  export function cache (opts?: CacheInterceptorOpts): Dispatcher.DispatcherComposeInterceptor
  export function deduplicate (opts?: DeduplicateInterceptorOpts): Dispatcher.DispatcherComposeInterceptor
}
