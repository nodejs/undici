import { Duplex, Readable, Writable } from 'stream'
import { expectAssignable } from 'tsd'
import { Client, Dispatcher } from '../..'
import { URL } from 'url'

expectAssignable<Client>(new Client(''))
expectAssignable<Client>(new Client('', {}))
expectAssignable<Client>(new Client(new URL('http://localhost'), {}))

{
  const client = new Client('')

  // properties
  expectAssignable<number>(client.pipelining)
  expectAssignable<boolean>(client.closed)
  expectAssignable<boolean>(client.destroyed)

  // request
  expectAssignable<PromiseLike<Dispatcher.ResponseData>>(client.request({ origin: '', path: '', method: '' }))
  expectAssignable<PromiseLike<Dispatcher.ResponseData>>(client.request({ origin: new URL('http://localhost:3000'), path: '', method: '' }))
  expectAssignable<void>(client.request({ origin: '', path: '', method: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ResponseData>(data)
  }))
  expectAssignable<void>(client.request({ origin: new URL('http://localhost:3000'), path: '', method: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ResponseData>(data)
  }))

  // stream
  expectAssignable<PromiseLike<Dispatcher.StreamData>>(client.stream({ origin: '', path: '', method: '' }, data => {
    expectAssignable<Dispatcher.StreamFactoryData>(data)
    return new Writable()
  }))
  expectAssignable<PromiseLike<Dispatcher.StreamData>>(client.stream({ origin: new URL('http://localhost'), path: '', method: '' }, data => {
    expectAssignable<Dispatcher.StreamFactoryData>(data)
    return new Writable()
  }))
  expectAssignable<void>(client.stream(
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
  expectAssignable<void>(client.stream(
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
  expectAssignable<Duplex>(client.pipeline({ origin: '', path: '', method: '' }, data => {
    expectAssignable<Dispatcher.PipelineHandlerData>(data)
    return new Readable()
  }))
  expectAssignable<Duplex>(client.pipeline({ origin: new URL('http://localhost'), path: '', method: '' }, data => {
    expectAssignable<Dispatcher.PipelineHandlerData>(data)
    return new Readable()
  }))

  // upgrade
  expectAssignable<PromiseLike<Dispatcher.UpgradeData>>(client.upgrade({ path: '' }))
  expectAssignable<void>(client.upgrade({ path: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.UpgradeData>(data)
  }))

  // connect
  expectAssignable<PromiseLike<Dispatcher.ConnectData>>(client.connect({ path: '' }))
  expectAssignable<void>(client.connect({ path: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ConnectData>(data)
  }))

  // dispatch
  expectAssignable<void>(client.dispatch({ origin: '', path: '', method: '' }, {}))
  expectAssignable<void>(client.dispatch({ origin: new URL('http://localhost'), path: '', method: '' }, {}))

  // close
  expectAssignable<PromiseLike<void>>(client.close())
  expectAssignable<void>(client.close(() => {}))

  // destroy
  expectAssignable<PromiseLike<void>>(client.destroy())
  expectAssignable<PromiseLike<void>>(client.destroy(new Error()))
  expectAssignable<PromiseLike<void>>(client.destroy(null))
  expectAssignable<void>(client.destroy(() => {}))
  expectAssignable<void>(client.destroy(new Error(), () => {}))
  expectAssignable<void>(client.destroy(null, () => {}))
}
