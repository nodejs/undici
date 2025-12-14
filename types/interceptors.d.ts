import CacheHandler from './cache-interceptor'
import Dispatcher from './dispatcher'
import RetryHandler from './retry-handler'
import { LookupOptions } from 'node:dns'

export default Interceptors

declare namespace Interceptors {
  export type DumpInterceptorOpts = { maxSize?: number }
  export type RetryInterceptorOpts = RetryHandler.RetryOptions
  export type RedirectInterceptorOpts = { maxRedirections?: number }
  export type DecompressInterceptorOpts = {
    skipErrorResponses?: boolean
    skipStatusCodes?: number[]
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
    maxTTL?: number
    maxItems?: number
    lookup?: (origin: URL, options: LookupOptions, callback: (err: NodeJS.ErrnoException | null, addresses: DNSInterceptorRecord[]) => void) => void
    pick?: (origin: URL, records: DNSInterceptorOriginRecords, affinity: 4 | 6) => DNSInterceptorRecord
    dualStack?: boolean
    affinity?: 4 | 6
    storage?: DNSStorage
  }

  // Circuit breaker interceptor
  export interface CircuitBreakerStorage {
    get(key: string): CircuitBreakerState
    delete(key: string): void
    destroy(): void
    readonly size: number
  }

  export interface CircuitBreakerState {
    state: 0 | 1 | 2  // CLOSED | OPEN | HALF_OPEN
    failureCount: number
    successCount: number
    lastFailureTime: number
    halfOpenRequests: number
    reset(): void
  }

  export type CircuitBreakerInterceptorOpts = {
    /** Number of failures before opening circuit. Default: 5 */
    threshold?: number
    /** Duration circuit stays open in ms. Default: 30000 */
    timeout?: number
    /** Successes needed in half-open state to close circuit. Default: 1 */
    successThreshold?: number
    /** Max concurrent requests allowed in half-open state. Default: 1 */
    maxHalfOpenRequests?: number
    /** HTTP status codes that count as failures. Default: [500, 502, 503, 504] */
    statusCodes?: Set<number> | number[]
    /** Error codes that count as failures. Default: timeout and connection errors */
    errorCodes?: Set<string> | string[]
    /** Function to extract circuit key from request options. Default: uses origin */
    getKey?: (opts: Dispatcher.DispatchOptions) => string
    /** Custom storage instance for circuit states */
    storage?: CircuitBreakerStorage
    /** Callback when circuit state changes */
    onStateChange?: (key: string, newState: 'closed' | 'open' | 'half-open', previousState: 'closed' | 'open' | 'half-open') => void
  }

  export function dump (opts?: DumpInterceptorOpts): Dispatcher.DispatcherComposeInterceptor
  export function retry (opts?: RetryInterceptorOpts): Dispatcher.DispatcherComposeInterceptor
  export function redirect (opts?: RedirectInterceptorOpts): Dispatcher.DispatcherComposeInterceptor
  export function decompress (opts?: DecompressInterceptorOpts): Dispatcher.DispatcherComposeInterceptor
  export function responseError (opts?: ResponseErrorInterceptorOpts): Dispatcher.DispatcherComposeInterceptor
  export function dns (opts?: DNSInterceptorOpts): Dispatcher.DispatcherComposeInterceptor
  export function cache (opts?: CacheInterceptorOpts): Dispatcher.DispatcherComposeInterceptor
  export function circuitBreaker (opts?: CircuitBreakerInterceptorOpts): Dispatcher.DispatcherComposeInterceptor
}
