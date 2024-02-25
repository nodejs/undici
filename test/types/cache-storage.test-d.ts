import { expectAssignable } from 'tsd'
import {
  caches,
  CacheStorage,
  Cache,
  CacheQueryOptions,
  MultiCacheQueryOptions,
  RequestInfo,
  Request,
  Response
} from '../..'

declare const response: Response
declare const request: Request
declare const options: RequestInfo
declare const cache: Cache

expectAssignable<CacheStorage>(caches)
expectAssignable<MultiCacheQueryOptions>({})
expectAssignable<MultiCacheQueryOptions>({ cacheName: 'v1' })
expectAssignable<MultiCacheQueryOptions>({ ignoreMethod: false, ignoreSearch: true })

expectAssignable<CacheQueryOptions>({})
expectAssignable<CacheQueryOptions>({ ignoreVary: false, ignoreMethod: true, ignoreSearch: true })

expectAssignable<Promise<Cache>>(caches.open('v1'))
expectAssignable<Promise<Response | undefined>>(caches.match(options))
expectAssignable<Promise<Response | undefined>>(caches.match(request))
expectAssignable<Promise<boolean>>(caches.has('v1'))
expectAssignable<Promise<boolean>>(caches.delete('v1'))
expectAssignable<Promise<string[]>>(caches.keys())

expectAssignable<Promise<Response | undefined>>(cache.match(options))
expectAssignable<Promise<readonly Response[]>>(cache.matchAll('v1'))
expectAssignable<Promise<boolean>>(cache.delete('v1'))
expectAssignable<Promise<readonly Request[]>>(cache.keys())
expectAssignable<Promise<undefined>>(cache.add(options))
expectAssignable<Promise<undefined>>(cache.addAll([options]))
expectAssignable<Promise<undefined>>(cache.put(options, response))
