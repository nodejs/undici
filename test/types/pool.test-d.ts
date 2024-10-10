import { expectAssignable, expectType } from 'tsd'
import { Dispatcher, Pool, Client } from '../..'
import { URL } from 'url'

expectAssignable<Pool>(new Pool(''))
expectAssignable<Pool>(new Pool('', {}))
expectAssignable<Pool>(new Pool(new URL('http://localhost'), {}))
expectAssignable<Pool>(new Pool('', { factory: () => new Dispatcher() }))
expectAssignable<Pool>(new Pool('', { factory: (origin, opts) => new Client(origin, opts) }))
expectAssignable<Pool>(new Pool('', { connections: 1 }))

{
  const pool = new Pool('', {})

  // properties
  expectAssignable<boolean>(pool.closed)
  expectAssignable<boolean>(pool.destroyed)
  expectAssignable<Pool.PoolStats>(pool.stats)

  // request
  expectAssignable<Promise<Dispatcher.ResponseData>>(pool.request({ origin: '', path: '', method: 'GET' }))
  expectAssignable<Promise<Dispatcher.ResponseData>>(pool.request({ origin: new URL('http://localhost'), path: '', method: 'GET' }))
  expectAssignable<void>(pool.request({ origin: '', path: '', method: 'GET' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ResponseData>(data)
  }))
  expectAssignable<void>(pool.request({ origin: new URL('http://localhost'), path: '', method: 'GET' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ResponseData>(data)
  }))

  // dispatch
  expectAssignable<boolean>(pool.dispatch({ origin: '', path: '', method: 'GET' }, {}))
  expectAssignable<boolean>(pool.dispatch({ origin: new URL('http://localhost'), path: '', method: 'GET' }, {}))

  // close
  expectAssignable<Promise<void>>(pool.close())
  expectAssignable<void>(pool.close(() => {}))

  // destroy
  expectAssignable<Promise<void>>(pool.destroy())
  expectAssignable<Promise<void>>(pool.destroy(new Error()))
  expectAssignable<Promise<void>>(pool.destroy(null))
  expectAssignable<void>(pool.destroy(() => {}))
  expectAssignable<void>(pool.destroy(new Error(), () => {}))
  expectAssignable<void>(pool.destroy(null, () => {}))

  // stats
  expectType<number>(pool.stats.connected)
  expectType<number>(pool.stats.free)
  expectType<number>(pool.stats.pending)
  expectType<number>(pool.stats.queued)
  expectType<number>(pool.stats.running)
  expectType<number>(pool.stats.size)
}
