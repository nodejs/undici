import { Duplex, Readable, Writable } from 'stream'
import { expectAssignable, expectType } from 'tsd'
import { Dispatcher } from '../..'
import { URL } from 'url'
import { Blob } from 'buffer'

expectAssignable<Dispatcher>(new Dispatcher())

{
  const dispatcher = new Dispatcher()

  // dispatch
  expectAssignable<boolean>(dispatcher.dispatch({ path: '', method: 'GET' }, {}))
  expectAssignable<boolean>(dispatcher.dispatch({ origin: '', path: '', method: 'GET' }, {}))
  expectAssignable<boolean>(dispatcher.dispatch({ origin: '', path: '', method: 'GET', headers: [] }, {}))
  expectAssignable<boolean>(dispatcher.dispatch({ origin: '', path: '', method: 'GET', headers: {} }, {}))
  expectAssignable<boolean>(dispatcher.dispatch({ origin: '', path: '', method: 'GET', headers: null }, {}))
  expectAssignable<boolean>(dispatcher.dispatch({ origin: new URL('http://localhost'), path: '', method: 'GET' }, {}))

  // connect
  expectAssignable<Promise<Dispatcher.ConnectData>>(dispatcher.connect({ path: '', maxRedirections: 0 }))
  expectAssignable<void>(dispatcher.connect({ path: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ConnectData>(data)
  }))

  // request
  expectAssignable<Promise<Dispatcher.ResponseData>>(dispatcher.request({ origin: '', path: '', method: 'GET', maxRedirections: 0 }))
  expectAssignable<Promise<Dispatcher.ResponseData>>(dispatcher.request({ origin: new URL('http://localhost'), path: '', method: 'GET' }))
  expectAssignable<void>(dispatcher.request({ origin: '', path: '', method: 'GET' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ResponseData>(data)
  }))
  expectAssignable<void>(dispatcher.request({ origin: new URL('http://localhost'), path: '', method: 'GET' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ResponseData>(data)
  }))

  // pipeline
  expectAssignable<Duplex>(dispatcher.pipeline({ origin: '', path: '', method: 'GET', maxRedirections: 0 }, data => {
    expectAssignable<Dispatcher.PipelineHandlerData>(data)
    return new Readable()
  }))
  expectAssignable<Duplex>(dispatcher.pipeline({ origin: new URL('http://localhost'), path: '', method: 'GET' }, data => {
    expectAssignable<Dispatcher.PipelineHandlerData>(data)
    return new Readable()
  }))

  // stream
  expectAssignable<Promise<Dispatcher.StreamData>>(dispatcher.stream({ origin: '', path: '', method: 'GET', maxRedirections: 0 }, data => {
    expectAssignable<Dispatcher.StreamFactoryData>(data)
    return new Writable()
  }))
  expectAssignable<Promise<Dispatcher.StreamData>>(dispatcher.stream({ origin: new URL('http://localhost'), path: '', method: 'GET' }, data => {
    expectAssignable<Dispatcher.StreamFactoryData>(data)
    return new Writable()
  }))
  expectAssignable<void>(dispatcher.stream(
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
  expectAssignable<void>(dispatcher.stream(
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

declare const { body }: Dispatcher.ResponseData;

{
  // body mixin tests
  expectType<never | undefined>(body.body)
  expectType<boolean>(body.bodyUsed)
  expectType<Promise<ArrayBuffer>>(body.arrayBuffer())
  expectType<Promise<Blob>>(body.blob())
  expectType<Promise<never>>(body.formData())
  expectType<Promise<string>>(body.text())
  expectType<Promise<any>>(body.json())
}
