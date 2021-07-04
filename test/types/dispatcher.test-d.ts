import { Duplex, Readable, Writable } from 'stream'
import { expectAssignable } from 'tsd'
import { Dispatcher } from '../..'
import { URL } from 'url'

expectAssignable<Dispatcher>(new Dispatcher())

{
  const dispatcher = new Dispatcher()

  // dispatch
  expectAssignable<void>(dispatcher.dispatch({ origin: '', path: '', method: '' }, {}))
  expectAssignable<void>(dispatcher.dispatch({ origin: '', path: '', method: '', headers: [] }, {}))
  expectAssignable<void>(dispatcher.dispatch({ origin: '', path: '', method: '', headers: {} }, {}))
  expectAssignable<void>(dispatcher.dispatch({ origin: '', path: '', method: '', headers: null }, {}))
  expectAssignable<void>(dispatcher.dispatch({ origin: new URL('http://localhost'), path: '', method: '' }, {}))

  // connect
  expectAssignable<Promise<Dispatcher.ConnectData>>(dispatcher.connect({ path: '', maxRedirections: 0 }))
  expectAssignable<void>(dispatcher.connect({ path: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ConnectData>(data)
  }))

  // request
  expectAssignable<Promise<Dispatcher.ResponseData>>(dispatcher.request({ origin: '', path: '', method: '', maxRedirections: 0 }))
  expectAssignable<Promise<Dispatcher.ResponseData>>(dispatcher.request({ origin: new URL('http://localhost'), path: '', method: '' }))
  expectAssignable<void>(dispatcher.request({ origin: '', path: '', method: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ResponseData>(data)
  }))
  expectAssignable<void>(dispatcher.request({ origin: new URL('http://localhost'), path: '', method: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ResponseData>(data)
  }))

  // pipeline
  expectAssignable<Duplex>(dispatcher.pipeline({ origin: '', path: '', method: '', maxRedirections: 0 }, data => {
    expectAssignable<Dispatcher.PipelineHandlerData>(data)
    return new Readable()
  }))
  expectAssignable<Duplex>(dispatcher.pipeline({ origin: new URL('http://localhost'), path: '', method: '' }, data => {
    expectAssignable<Dispatcher.PipelineHandlerData>(data)
    return new Readable()
  }))

  // stream
  expectAssignable<Promise<Dispatcher.StreamData>>(dispatcher.stream({ origin: '', path: '', method: '', maxRedirections: 0 }, data => {
    expectAssignable<Dispatcher.StreamFactoryData>(data)
    return new Writable()
  }))
  expectAssignable<Promise<Dispatcher.StreamData>>(dispatcher.stream({ origin: new URL('http://localhost'), path: '', method: '' }, data => {
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
  expectAssignable<Promise<Dispatcher.UpgradeData>>(dispatcher.upgrade({ path: '', maxRedirections: 0 }))
  expectAssignable<void>(dispatcher.upgrade({ path: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.UpgradeData>(data)
  }))

  // close
  expectAssignable<Promise<void>>(dispatcher.close())
  expectAssignable<void>(dispatcher.close(() => {}))

  // destroy
  expectAssignable<Promise<void>>(dispatcher.destroy())
  expectAssignable<Promise<void>>(dispatcher.destroy(new Error()))
  expectAssignable<Promise<void>>(dispatcher.destroy(null))
  expectAssignable<void>(dispatcher.destroy(() => {}))
  expectAssignable<void>(dispatcher.destroy(new Error(), () => {}))
  expectAssignable<void>(dispatcher.destroy(null, () => {}))
}
