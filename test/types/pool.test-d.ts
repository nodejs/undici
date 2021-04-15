import { Duplex, Readable, Writable } from 'stream'
import { expectAssignable } from 'tsd'
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

  // request
  expectAssignable<PromiseLike<Dispatcher.ResponseData>>(pool.request({ origin: '', path: '', method: '' }))
  expectAssignable<PromiseLike<Dispatcher.ResponseData>>(pool.request({ origin: new URL('http://localhost'), path: '', method: '' }))
  expectAssignable<void>(pool.request({ origin: '', path: '', method: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ResponseData>(data)
  }))
  expectAssignable<void>(pool.request({ origin: new URL('http://localhost'), path: '', method: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ResponseData>(data)
  }))

  // stream
  expectAssignable<PromiseLike<Dispatcher.StreamData>>(pool.stream({ origin: '', path: '', method: '' }, data => {
    expectAssignable<Dispatcher.StreamFactoryData>(data)
    return new Writable()
  }))
  expectAssignable<PromiseLike<Dispatcher.StreamData>>(pool.stream({ origin: new URL('http://localhost'), path: '', method: '' }, data => {
    expectAssignable<Dispatcher.StreamFactoryData>(data)
    return new Writable()
  }))
  expectAssignable<void>(pool.stream(
    { origin: '', path: '', method: '' },
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
    { origin: new URL('http://localhost'), path: '', method: '' },
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
  expectAssignable<Duplex>(pool.pipeline({ origin: '', path: '', method: '' }, data => {
    expectAssignable<Dispatcher.PipelineHandlerData>(data)
    return new Readable()
  }))
  expectAssignable<Duplex>(pool.pipeline({ origin: new URL('http://localhost'), path: '', method: '' }, data => {
    expectAssignable<Dispatcher.PipelineHandlerData>(data)
    return new Readable()
  }))

  // upgrade
  expectAssignable<PromiseLike<Dispatcher.UpgradeData>>(pool.upgrade({ path: '' }))
  expectAssignable<void>(pool.upgrade({ path: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.UpgradeData>(data)
  }))

  // connect
  expectAssignable<PromiseLike<Dispatcher.ConnectData>>(pool.connect({ path: '' }))
  expectAssignable<void>(pool.connect({ path: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ConnectData>(data)
  }))

  // dispatch
  expectAssignable<void>(pool.dispatch({ origin: '', path: '', method: '' }, {}))
  expectAssignable<void>(pool.dispatch({ origin: new URL('http://localhost'), path: '', method: '' }, {}))

  // close
  expectAssignable<PromiseLike<void>>(pool.close())
  expectAssignable<void>(pool.close(() => {}))

  // destroy
  expectAssignable<PromiseLike<void>>(pool.destroy())
  expectAssignable<PromiseLike<void>>(pool.destroy(new Error()))
  expectAssignable<PromiseLike<void>>(pool.destroy(null))
  expectAssignable<void>(pool.destroy(() => {}))
  expectAssignable<void>(pool.destroy(new Error(), () => {}))
  expectAssignable<void>(pool.destroy(null, () => {}))
}
