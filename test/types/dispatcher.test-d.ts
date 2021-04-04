import { Duplex, Readable, Writable } from 'stream'
import { expectAssignable } from 'tsd'
import { Dispatcher } from '../..'
import { URL } from 'url'

expectAssignable<Dispatcher>(new Dispatcher())

{
  const dispatcher = new Dispatcher()

  // dispatch
  expectAssignable<void>(dispatcher.dispatch({ origin: '', path: '', method: '' }, {}))
  expectAssignable<void>(dispatcher.dispatch({ origin: new URL('http://localhost'), path: '', method: '' }, {}))

  // connect
  expectAssignable<PromiseLike<Dispatcher.ConnectData>>(dispatcher.connect({ path: '' }))
  expectAssignable<void>(dispatcher.connect({ path: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ConnectData>(data)
  }))

  // request
  expectAssignable<PromiseLike<Dispatcher.ResponseData>>(dispatcher.request({ origin: '', path: '', method: '' }))
  expectAssignable<PromiseLike<Dispatcher.ResponseData>>(dispatcher.request({ origin: new URL('http://localhost'), path: '', method: '' }))
  expectAssignable<void>(dispatcher.request({ origin: '', path: '', method: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ResponseData>(data)
  }))
  expectAssignable<void>(dispatcher.request({ origin: new URL('http://localhost'), path: '', method: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ResponseData>(data)
  }))

  // pipeline
  expectAssignable<Duplex>(dispatcher.pipeline({ origin: '', path: '', method: '' }, data => {
    expectAssignable<Dispatcher.PipelineHandlerData>(data)
    return new Readable()
  }))
  expectAssignable<Duplex>(dispatcher.pipeline({ origin: new URL('http://localhost'), path: '', method: '' }, data => {
    expectAssignable<Dispatcher.PipelineHandlerData>(data)
    return new Readable()
  }))

  // stream
  expectAssignable<PromiseLike<Dispatcher.StreamData>>(dispatcher.stream({ origin: '', path: '', method: '' }, data => {
    expectAssignable<Dispatcher.StreamFactoryData>(data)
    return new Writable()
  }))
  expectAssignable<PromiseLike<Dispatcher.StreamData>>(dispatcher.stream({ origin: new URL('http://localhost'), path: '', method: '' }, data => {
    expectAssignable<Dispatcher.StreamFactoryData>(data)
    return new Writable()
  }))
  expectAssignable<void>(dispatcher.stream(
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
  expectAssignable<void>(dispatcher.stream(
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

  // upgrade
  expectAssignable<PromiseLike<Dispatcher.UpgradeData>>(dispatcher.upgrade({ path: '' }))
  expectAssignable<void>(dispatcher.upgrade({ path: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.UpgradeData>(data)
  }))

  // close
  expectAssignable<PromiseLike<void>>(dispatcher.close())
  expectAssignable<void>(dispatcher.close(() => {}))

  // destroy
  expectAssignable<PromiseLike<void>>(dispatcher.destroy())
  expectAssignable<PromiseLike<void>>(dispatcher.destroy(new Error()))
  expectAssignable<PromiseLike<void>>(dispatcher.destroy(null))
  expectAssignable<void>(dispatcher.destroy(() => {}))
  expectAssignable<void>(dispatcher.destroy(new Error(), () => {}))
  expectAssignable<void>(dispatcher.destroy(null, () => {}))
}
