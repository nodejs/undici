import { Duplex, Readable, Writable } from 'stream'
import { expectAssignable } from 'tsd'
import { Client, Dispatcher } from '../..'
import { URL } from 'url'

expectAssignable<Client>(new Client(''))
expectAssignable<Client>(new Client('', {}))
expectAssignable<Client>(new Client('', {
  connect: { rejectUnauthorized: false }
}))
expectAssignable<Client>(new Client(new URL('http://localhost'), {}))

{
  const client = new Client('')

  // properties
  expectAssignable<number>(client.pipelining)
  expectAssignable<boolean>(client.closed)
  expectAssignable<boolean>(client.destroyed)

  // request
  expectAssignable<Promise<Dispatcher.ResponseData>>(client.request({ origin: '', path: '', method: '' }))
  expectAssignable<Promise<Dispatcher.ResponseData>>(client.request({ origin: new URL('http://localhost:3000'), path: '', method: '' }))
  expectAssignable<Promise<Dispatcher.ResponseData>>(client.request({ path: '/', method: 'GET' }))
  expectAssignable<void>(client.request({ origin: '', path: '', method: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ResponseData>(data)
  }))
  expectAssignable<void>(client.request({ origin: new URL('http://localhost:3000'), path: '', method: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ResponseData>(data)
  }))

  // stream
  expectAssignable<Promise<Dispatcher.StreamData>>(client.stream({ origin: '', path: '', method: '' }, data => {
    expectAssignable<Dispatcher.StreamFactoryData>(data)
    return new Writable()
  }))
  expectAssignable<Promise<Dispatcher.StreamData>>(client.stream({ origin: new URL('http://localhost'), path: '', method: '' }, data => {
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
  expectAssignable<Promise<Dispatcher.UpgradeData>>(client.upgrade({ path: '' }))
  expectAssignable<Promise<Dispatcher.UpgradeData>>(client.upgrade({ path: '', headers: [] }))
  expectAssignable<Promise<Dispatcher.UpgradeData>>(client.upgrade({ path: '', headers: {} }))
  expectAssignable<Promise<Dispatcher.UpgradeData>>(client.upgrade({ path: '', headers: null }))
  expectAssignable<void>(client.upgrade({ path: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.UpgradeData>(data)
  }))

  // connect
  expectAssignable<Promise<Dispatcher.ConnectData>>(client.connect({ path: '' }))
  expectAssignable<Promise<Dispatcher.ConnectData>>(client.connect({ path: '', headers: [] }))
  expectAssignable<Promise<Dispatcher.ConnectData>>(client.connect({ path: '', headers: {} }))
  expectAssignable<Promise<Dispatcher.ConnectData>>(client.connect({ path: '', headers: null }))
  expectAssignable<void>(client.connect({ path: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ConnectData>(data)
  }))

  // dispatch
  expectAssignable<void>(client.dispatch({ path: '', method: '' }, {}))
  expectAssignable<void>(client.dispatch({ origin: '', path: '', method: '' }, {}))
  expectAssignable<void>(client.dispatch({ origin: '', path: '', method: '', headers: [] }, {}))
  expectAssignable<void>(client.dispatch({ origin: '', path: '', method: '', headers: {} }, {}))
  expectAssignable<void>(client.dispatch({ origin: '', path: '', method: '', headers: null }, {}))
  expectAssignable<void>(client.dispatch({ origin: new URL('http://localhost'), path: '', method: '' }, {}))

  // close
  expectAssignable<Promise<void>>(client.close())
  expectAssignable<void>(client.close(() => {}))

  // destroy
  expectAssignable<Promise<void>>(client.destroy())
  expectAssignable<Promise<void>>(client.destroy(new Error()))
  expectAssignable<Promise<void>>(client.destroy(null))
  expectAssignable<void>(client.destroy(() => {}))
  expectAssignable<void>(client.destroy(new Error(), () => {}))
  expectAssignable<void>(client.destroy(null, () => {}))
}
