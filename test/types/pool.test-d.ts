import { Duplex, Readable, Writable } from 'stream'
import { expectAssignable } from 'tsd'
import { Client, Pool } from '../..'
import { URL } from 'url'

expectAssignable<Pool>(new Pool(''))
expectAssignable<Pool>(new Pool('', {}))
expectAssignable<Pool>(new Pool(new URL('http://localhost'), {}))

{
  const pool = new Pool('', {})

  // methods
  expectAssignable<number>(pool.pipelining)
  expectAssignable<number>(pool.pending)
  expectAssignable<number>(pool.running)
  expectAssignable<number>(pool.size)
  expectAssignable<boolean>(pool.connected)
  expectAssignable<boolean>(pool.busy)
  expectAssignable<boolean>(pool.closed)
  expectAssignable<boolean>(pool.destroyed)

  // request
  expectAssignable<PromiseLike<Client.ResponseData>>(pool.request({ path: '', method: '' }))
  expectAssignable<void>(pool.request({ path: '', method: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Client.ResponseData>(data)
  }))

  // stream
  expectAssignable<PromiseLike<Client.StreamData>>(pool.stream({ path: '', method: '' }, data => {
    expectAssignable<Client.StreamFactoryData>(data)
    return new Writable()
  }))
  expectAssignable<void>(pool.stream(
    { path: '', method: '' },
    data => {
      expectAssignable<Client.StreamFactoryData>(data)
      return new Writable()
    },
    (err, data) => {
      expectAssignable<Error | null>(err)
      expectAssignable<Client.StreamData>(data)
    }
  ))

  // pipeline
  expectAssignable<Duplex>(pool.pipeline({ path: '', method: '' }, data => {
    expectAssignable<Client.PipelineHandlerData>(data)
    return new Readable()
  }))

  // upgrade
  expectAssignable<PromiseLike<Client.UpgradeData>>(pool.upgrade({ path: '' }))
  expectAssignable<void>(pool.upgrade({ path: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Client.UpgradeData>(data)
  }))

  // connect
  expectAssignable<PromiseLike<Client.ConnectData>>(pool.connect({ path: '' }))
  expectAssignable<void>(pool.connect({ path: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Client.ConnectData>(data)
  }))

  // dispatch
  expectAssignable<void>(pool.dispatch({ path: '', method: '' }, {}))

  // close
  expectAssignable<PromiseLike<void>>(pool.close())
  expectAssignable<void>(pool.close(() => {}))

  // destroy
  expectAssignable<PromiseLike<void>>(pool.destroy())
  expectAssignable<PromiseLike<void>>(pool.destroy(new Error()))
  expectAssignable<void>(pool.destroy(() => {}))
  expectAssignable<void>(pool.destroy(new Error(), () => {}))
}
