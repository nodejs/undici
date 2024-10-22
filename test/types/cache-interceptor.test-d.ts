import { expectAssignable, expectNotAssignable } from 'tsd'
import CacheInterceptor from '../../types/cache-interceptor'
import Dispatcher from '../../types/dispatcher'

const store: CacheInterceptor.CacheStore = {
  isFull: false,

  createReadStream (_: Dispatcher.RequestOptions): CacheInterceptor.CacheStoreReadable | undefined {
    throw new Error('stub')
  },

  createWriteStream (_: Dispatcher.RequestOptions, _2: CacheInterceptor.CacheStoreValue): CacheInterceptor.CacheStoreWriteable | undefined {
    throw new Error('stub')
  },

  deleteByOrigin (_: string): void | Promise<void> {
    throw new Error('stub')
  },

  deleteByCacheTags (origin: string, cacheTags: string[]): Promise<void> {
    throw new Error('stub')
  }
}

expectAssignable<CacheInterceptor.CacheOptions>({})
expectAssignable<CacheInterceptor.CacheOptions>({ store })
expectAssignable<CacheInterceptor.CacheOptions>({ methods: [] })
expectAssignable<CacheInterceptor.CacheOptions>({ store, methods: ['GET'] })

expectAssignable<CacheInterceptor.CacheStoreValue>({
  statusCode: 200,
  statusMessage: 'OK',
  rawHeaders: [],
  cachedAt: 0,
  staleAt: 0,
  deleteAt: 0
})

expectAssignable<CacheInterceptor.CacheStoreValue>({
  statusCode: 200,
  statusMessage: 'OK',
  rawHeaders: [],
  rawTrailers: [],
  vary: {},
  cachedAt: 0,
  staleAt: 0,
  deleteAt: 0
})

expectNotAssignable<CacheInterceptor.CacheStoreValue>({})
expectNotAssignable<CacheInterceptor.CacheStoreValue>({
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
