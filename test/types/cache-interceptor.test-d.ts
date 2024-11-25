import { Writable } from 'node:stream'
import { expectAssignable, expectNotAssignable } from 'tsd'
import CacheInterceptor from '../../types/cache-interceptor'

const store: CacheInterceptor.CacheStore = {
  get (_: CacheInterceptor.CacheKey): CacheInterceptor.GetResult | Promise<CacheInterceptor.GetResult | undefined> | undefined {
    throw new Error('stub')
  },

  createWriteStream (_: CacheInterceptor.CacheKey, _2: CacheInterceptor.CacheValue): Writable | undefined {
    throw new Error('stub')
  },

  delete (_: CacheInterceptor.CacheKey): void | Promise<void> {
    throw new Error('stub')
  }
}

expectAssignable<CacheInterceptor.CacheOptions>({})
expectAssignable<CacheInterceptor.CacheOptions>({ store })
expectAssignable<CacheInterceptor.CacheOptions>({ methods: [] })
expectAssignable<CacheInterceptor.CacheOptions>({ store, methods: ['GET'] })

expectAssignable<CacheInterceptor.CacheValue>({
  statusCode: 200,
  statusMessage: 'OK',
  headers: {},
  cachedAt: 0,
  staleAt: 0,
  deleteAt: 0
})

expectAssignable<CacheInterceptor.CacheValue>({
  statusCode: 200,
  statusMessage: 'OK',
  headers: {},
  vary: {},
  cachedAt: 0,
  staleAt: 0,
  deleteAt: 0
})

expectNotAssignable<CacheInterceptor.CacheValue>({})
expectNotAssignable<CacheInterceptor.CacheValue>({
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
  maxSize: 0
})

expectAssignable<CacheInterceptor.SqliteCacheStoreOpts>({})
expectAssignable<CacheInterceptor.SqliteCacheStoreOpts>({
  location: '',
  maxEntrySize: 0
})
