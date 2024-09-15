import { expectAssignable, expectNotAssignable } from 'tsd'
import CacheInterceptor from '../../types/cache-interceptor'
import Dispatcher from '../../types/dispatcher'

const store: CacheInterceptor.CacheStore = {
  maxEntrySize: 0,

  get (_: Dispatcher.RequestOptions): CacheInterceptor.CacheStoreValue | Promise<CacheInterceptor.CacheStoreValue> {
    throw new Error('stub')
  },

  put (_: Dispatcher.RequestOptions, _2: CacheInterceptor.CacheStoreValue): void | Promise<void> {
    throw new Error('stub')
  }
}

expectAssignable<CacheInterceptor.CacheOptions>({})
expectAssignable<CacheInterceptor.CacheOptions>({ store })
expectAssignable<CacheInterceptor.CacheOptions>({ methods: [] })
expectAssignable<CacheInterceptor.CacheOptions>({ store, methods: ['GET'] })

expectAssignable<CacheInterceptor.CacheStoreValue>({
  complete: true,
  statusCode: 200,
  statusMessage: 'OK',
  rawHeaders: [],
  body: [],
  size: 0,
  cachedAt: 0,
  staleAt: 0,
  deleteAt: 0
})

expectAssignable<CacheInterceptor.CacheStoreValue>({
  complete: true,
  statusCode: 200,
  statusMessage: 'OK',
  rawHeaders: [],
  rawTrailers: [],
  body: [],
  vary: {},
  size: 0,
  cachedAt: 0,
  staleAt: 0,
  deleteAt: 0
})

expectNotAssignable<CacheInterceptor.CacheStoreValue>({})
expectNotAssignable<CacheInterceptor.CacheStoreValue>({
  complete: '',
  statusCode: '123',
  statusMessage: 123,
  rawHeaders: '',
  rawTrailers: '',
  body: 0,
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
