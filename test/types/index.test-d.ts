import { expectAssignable, expectType } from 'tsd'
import Undici, {
  Pool,
  Client,
  errors,
  fetch,
  Interceptable,
  RedirectHandler,
  Headers,
  Response,
  Request,
  FormData,
  SnapshotAgent,
  install,
  cacheStores
} from '../..'
import Dispatcher from '../../types/dispatcher'
import CacheInterceptor from '../../types/cache-interceptor'

expectAssignable<Pool>(new Undici.Pool('', {}))
expectAssignable<Client>(new Undici.Client('', {}))
expectAssignable<Interceptable>(new Undici.MockAgent().get(''))
expectAssignable<SnapshotAgent>(new Undici.SnapshotAgent())
expectAssignable<typeof errors>(Undici.errors)
expectAssignable<typeof fetch>(Undici.fetch)
expectAssignable<typeof Headers>(Undici.Headers)
expectAssignable<typeof Response>(Undici.Response)
expectAssignable<typeof Request>(Undici.Request)
expectAssignable<typeof FormData>(Undici.FormData)
expectAssignable<Dispatcher.DispatcherComposeInterceptor>(Undici.interceptors.dump())
expectAssignable<Dispatcher.DispatcherComposeInterceptor>(Undici.interceptors.redirect())
expectAssignable<Dispatcher.DispatcherComposeInterceptor>(Undici.interceptors.retry())
expectAssignable<Dispatcher.DispatcherComposeInterceptor>(Undici.interceptors.decompress())
expectAssignable<Dispatcher.DispatcherComposeInterceptor>(Undici.interceptors.cache())
expectAssignable<CacheInterceptor.CacheStore>(new Undici.cacheStores.MemoryCacheStore())
expectAssignable<CacheInterceptor.CacheStore>(new Undici.cacheStores.SqliteCacheStore())
expectAssignable<CacheInterceptor.CacheStore>(new cacheStores.MemoryCacheStore())
expectAssignable<CacheInterceptor.CacheStore>(new cacheStores.SqliteCacheStore())

const dispatcher = new Dispatcher()
const handler: Dispatcher.DispatchHandler = {}

const redirectHandler = new Undici.RedirectHandler(dispatcher.dispatch, 10, {
  path: '/', method: 'GET'
}, handler, false) as RedirectHandler
expectAssignable<RedirectHandler>(redirectHandler)

expectType<() => void>(install)
expectType<() => void>(Undici.install)
