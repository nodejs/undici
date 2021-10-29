import { Duplex, Readable, Writable } from 'stream'
import { expectAssignable } from 'tsd'
import { Dispatcher, BalancedPool, Client } from '../..'
import { URL } from 'url'

expectAssignable<BalancedPool>(new BalancedPool(''))
expectAssignable<BalancedPool>(new BalancedPool('', {}))
expectAssignable<BalancedPool>(new BalancedPool(new URL('http://localhost'), {}))
expectAssignable<BalancedPool>(new BalancedPool('', { factory: () => new Dispatcher() }))
expectAssignable<BalancedPool>(new BalancedPool('', { factory: (origin, opts) => new Client(origin, opts) }))
expectAssignable<BalancedPool>(new BalancedPool('', { connections: 1 }))
expectAssignable<BalancedPool>(new BalancedPool(['http://localhost:4242', 'http://www.nodejs.org']))

{
  const pool = new BalancedPool('', {})

  // properties
  expectAssignable<boolean>(pool.closed)
  expectAssignable<boolean>(pool.destroyed)

  // upstreams
  expectAssignable<BalancedPool>(pool.addUpstream('http://www.nodejs.org'))
  expectAssignable<BalancedPool>(pool.removeUpstream('http://www.nodejs.org'))
  expectAssignable<string[]>(pool.upstreams)


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

  // stream
  expectAssignable<Promise<Dispatcher.StreamData>>(pool.stream({ origin: '', path: '', method: 'GET' }, data => {
    expectAssignable<Dispatcher.StreamFactoryData>(data)
    return new Writable()
  }))
  expectAssignable<Promise<Dispatcher.StreamData>>(pool.stream({ origin: new URL('http://localhost'), path: '', method: 'GET' }, data => {
    expectAssignable<Dispatcher.StreamFactoryData>(data)
    return new Writable()
  }))
  expectAssignable<void>(pool.stream(
    { origin: '', path: '', method: 'GET' },
    data => {
      expectAssignable<Dispatcher.StreamFactoryData>(data)
      return new Writable()
    },
    (err, data) => {
      expectAssignable<Error | null>(err)
      expectAssignable<Dispatcher.StreamData>(data)
    }
  ))
  expectAssignable<void>(pool.stream(
    { origin: new URL('http://localhost'), path: '', method: 'GET' },
    data => {
      expectAssignable<Dispatcher.StreamFactoryData>(data)
      return new Writable()
    },
    (err, data) => {
      expectAssignable<Error | null>(err)
      expectAssignable<Dispatcher.StreamData>(data)
    }
  ))

  // pipeline
  expectAssignable<Duplex>(pool.pipeline({ origin: '', path: '', method: 'GET' }, data => {
    expectAssignable<Dispatcher.PipelineHandlerData>(data)
    return new Readable()
  }))
  expectAssignable<Duplex>(pool.pipeline({ origin: new URL('http://localhost'), path: '', method: 'GET' }, data => {
    expectAssignable<Dispatcher.PipelineHandlerData>(data)
    return new Readable()
  }))

  // upgrade
  expectAssignable<Promise<Dispatcher.UpgradeData>>(pool.upgrade({ path: '' }))
  expectAssignable<void>(pool.upgrade({ path: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.UpgradeData>(data)
  }))

  // connect
  expectAssignable<Promise<Dispatcher.ConnectData>>(pool.connect({ path: '' }))
  expectAssignable<void>(pool.connect({ path: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ConnectData>(data)
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
}
