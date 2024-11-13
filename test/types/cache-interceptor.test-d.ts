import { Writable } from 'node:stream'
import { expectAssignable, expectNotAssignable } from 'tsd'
import CacheInterceptor from '../../types/cache-interceptor'

const store: CacheInterceptor.CacheStore = {
  isFull: false,

  get (_: CacheInterceptor.CacheKey): CacheInterceptor.GetResult | Promise<CacheInterceptor.GetResult | undefined> | undefined {
    throw new Error('stub')
  },

  createWriteStream (_: CacheInterceptor.CacheKey, _2: CacheInterceptor.CachedResponse): Writable | undefined {
    throw new Error('stub')
  },

  deleteByKey (_: CacheInterceptor.CacheKey): void | Promise<void> {
    throw new Error('stub')
  }
}

expectAssignable<CacheInterceptor.CacheOptions>({})
expectAssignable<CacheInterceptor.CacheOptions>({ store })
expectAssignable<CacheInterceptor.CacheOptions>({ methods: [] })
expectAssignable<CacheInterceptor.CacheOptions>({ store, methods: ['GET'] })

expectAssignable<CacheInterceptor.CachedResponse>({
  statusCode: 200,
  statusMessage: 'OK',
  rawHeaders: [],
  cachedAt: 0,
  staleAt: 0,
  deleteAt: 0
})

expectAssignable<CacheInterceptor.CachedResponse>({
  statusCode: 200,
  statusMessage: 'OK',
  rawHeaders: [],
  vary: {},
  cachedAt: 0,
  staleAt: 0,
  deleteAt: 0
})

expectNotAssignable<CacheInterceptor.CachedResponse>({})
expectNotAssignable<CacheInterceptor.CachedResponse>({
  statusCode: '123',
  statusMessage: 123,
  rawHeaders: '',
  vary: '',
  size: '',
  cachedAt: '',
  staleAt: '',
  deleteAt: ''
})

expectAssignable<CacheInterceptor.MemoryCacheStoreOpts>({})
expectAssignable<CacheInterceptor.MemoryCacheStoreOpts>({
  maxEntrySize: 0
})
