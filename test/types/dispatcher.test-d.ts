import { IncomingHttpHeaders } from 'http'
import { Duplex, Readable, Writable } from 'stream'
import { expectAssignable, expectType } from 'tsd'
import { Dispatcher, Headers } from '../..'
import { URL } from 'url'
import { Blob } from 'buffer'

expectAssignable<Dispatcher>(new Dispatcher())

{
  const dispatcher = new Dispatcher()

  const nodeCoreHeaders = {
    authorization: undefined,
    'content-type': 'application/json'
  } satisfies IncomingHttpHeaders

  const headerInstanceHeaders = new Headers({ hello: 'world' })
  const mapHeaders = new Map([['hello', 'world']])
  const iteratorHeaders = {
    * [Symbol.iterator] () {
      yield ['hello', 'world']
    }
  }
  const recordHeadersString: Record<string, string> = { hello: 'world' }
  const recordHeadersStringArray: Record<string, string[]> = { foo: ['hello', 'world'] }
  const recordHeadersUndefined: Record<string, undefined> = { bar: undefined }

  // dispatch
  expectAssignable<boolean>(dispatcher.dispatch({ path: '', method: 'GET' }, {}))
  expectAssignable<boolean>(dispatcher.dispatch({ origin: '', path: '', method: 'GET' }, {}))
  expectAssignable<boolean>(dispatcher.dispatch({ origin: '', path: '', method: 'GET', headers: { authorization: undefined } }, {}))
  expectAssignable<boolean>(dispatcher.dispatch({ origin: '', path: '', method: 'GET', headers: [] }, {}))
  expectAssignable<boolean>(dispatcher.dispatch({ origin: '', path: '', method: 'GET', headers: ['hello', 'world'] }, {}))
  expectAssignable<boolean>(dispatcher.dispatch({ origin: '', path: '', method: 'GET', headers: {} }, {}))
  expectAssignable<boolean>(dispatcher.dispatch({ origin: '', path: '', method: 'GET', headers: nodeCoreHeaders }, {}))
  expectAssignable<boolean>(dispatcher.dispatch({ origin: '', path: '', method: 'GET', headers: null, reset: true }, {}))
  expectAssignable<boolean>(dispatcher.dispatch({ origin: '', path: '', method: 'GET', headers: undefined, reset: true }, {}))
  expectAssignable<boolean>(dispatcher.dispatch({ origin: '', path: '', method: 'GET', headers: recordHeadersString, reset: true }, {}))
  expectAssignable<boolean>(dispatcher.dispatch({ origin: '', path: '', method: 'GET', headers: recordHeadersStringArray, reset: true }, {}))
  expectAssignable<boolean>(dispatcher.dispatch({ origin: '', path: '', method: 'GET', headers: recordHeadersUndefined, reset: true }, {}))
  expectAssignable<boolean>(dispatcher.dispatch({ origin: '', path: '', method: 'GET', headers: headerInstanceHeaders, reset: true }, {}))
  expectAssignable<boolean>(dispatcher.dispatch({ origin: '', path: '', method: 'GET', headers: mapHeaders, reset: true }, {}))
  expectAssignable<boolean>(dispatcher.dispatch({ origin: '', path: '', method: 'GET', headers: iteratorHeaders, reset: true }, {}))
  expectAssignable<boolean>(dispatcher.dispatch({ origin: new URL('http://localhost'), path: '', method: 'GET' }, {}))
  expectAssignable<boolean>(dispatcher.dispatch({ path: '', method: 'CUSTOM' }, {}))

  // connect
  expectAssignable<Promise<Dispatcher.ConnectData>>(dispatcher.connect({ origin: '', path: '' }))
  expectAssignable<Promise<Dispatcher.ConnectData>>(dispatcher.connect({ origin: new URL('http://localhost'), path: '' }))
  expectAssignable<void>(dispatcher.connect({ origin: '', path: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ConnectData>(data)
  }))
  expectAssignable<void>(dispatcher.connect({ origin: new URL('http://localhost'), path: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ConnectData>(data)
  }))
  expectAssignable<Promise<Dispatcher.ConnectData>>(dispatcher.connect({ origin: '', path: '', responseHeaders: 'raw' }))
  expectAssignable<Promise<Dispatcher.ConnectData>>(dispatcher.connect({ origin: '', path: '', responseHeaders: null }))
  expectAssignable<Promise<Dispatcher.ConnectData>>(dispatcher.connect({ origin: '', path: '', headers: { authorization: undefined } }))
  expectAssignable<Promise<Dispatcher.ConnectData>>(dispatcher.connect({ origin: '', path: '', headers: [] }))
  expectAssignable<Promise<Dispatcher.ConnectData>>(dispatcher.connect({ origin: '', path: '', headers: ['hello', 'world'] }))
  expectAssignable<Promise<Dispatcher.ConnectData>>(dispatcher.connect({ origin: '', path: '', headers: {} }))
  expectAssignable<Promise<Dispatcher.ConnectData>>(dispatcher.connect({ origin: '', path: '', headers: nodeCoreHeaders }))
  expectAssignable<Promise<Dispatcher.ConnectData>>(dispatcher.connect({ origin: '', path: '', headers: null }))
  expectAssignable<Promise<Dispatcher.ConnectData>>(dispatcher.connect({ origin: '', path: '', headers: undefined }))
  expectAssignable<Promise<Dispatcher.ConnectData>>(dispatcher.connect({ origin: '', path: '', headers: recordHeadersString }))
  expectAssignable<Promise<Dispatcher.ConnectData>>(dispatcher.connect({ origin: '', path: '', headers: recordHeadersStringArray }))
  expectAssignable<Promise<Dispatcher.ConnectData>>(dispatcher.connect({ origin: '', path: '', headers: recordHeadersUndefined }))
  expectAssignable<Promise<Dispatcher.ConnectData>>(dispatcher.connect({ origin: '', path: '', headers: headerInstanceHeaders }))
  expectAssignable<Promise<Dispatcher.ConnectData>>(dispatcher.connect({ origin: '', path: '', headers: mapHeaders }))
  expectAssignable<Promise<Dispatcher.ConnectData>>(dispatcher.connect({ origin: '', path: '', headers: iteratorHeaders }))

  // request
  expectAssignable<Promise<Dispatcher.ResponseData>>(dispatcher.request({ origin: '', path: '', method: 'GET' }))
  expectAssignable<Promise<Dispatcher.ResponseData>>(dispatcher.request({ origin: '', path: '', method: 'GET', query: {} }))
  expectAssignable<Promise<Dispatcher.ResponseData>>(dispatcher.request({ origin: '', path: '', method: 'GET', query: { pageNum: 1, id: 'abc' } }))
  expectAssignable<Promise<Dispatcher.ResponseData>>(dispatcher.request({ origin: '', path: '', method: 'GET', throwOnError: true }))
  expectAssignable<Promise<Dispatcher.ResponseData>>(dispatcher.request({ origin: new URL('http://localhost'), path: '', method: 'GET' }))
  expectAssignable<void>(dispatcher.request({ origin: '', path: '', method: 'GET', reset: true }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ResponseData>(data)
  }))
  expectAssignable<void>(dispatcher.request({ origin: new URL('http://localhost'), path: '', method: 'GET' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ResponseData>(data)
  }))
  expectAssignable<Promise<Dispatcher.ResponseData>>(dispatcher.request({ origin: '', path: '', method: 'GET', responseHeaders: 'raw' }))
  expectAssignable<Promise<Dispatcher.ResponseData>>(dispatcher.request({ origin: '', path: '', method: 'GET', responseHeaders: null }))
  expectAssignable<Promise<Dispatcher.ResponseData<{ example: string }>>>(dispatcher.request({ origin: '', path: '', method: 'GET', opaque: { example: '' } }))

  // pipeline
  expectAssignable<Duplex>(dispatcher.pipeline({ origin: '', path: '', method: 'GET' }, data => {
    expectAssignable<Dispatcher.PipelineHandlerData>(data)
    return new Readable()
  }))
  expectAssignable<Duplex>(dispatcher.pipeline({ origin: new URL('http://localhost'), path: '', method: 'GET' }, data => {
    expectAssignable<Dispatcher.PipelineHandlerData>(data)
    return new Readable()
  }))
  expectAssignable<Duplex>(dispatcher.pipeline({ origin: '', path: '', method: 'GET', responseHeaders: 'raw' }, data => {
    expectAssignable<Dispatcher.PipelineHandlerData>(data)
    return new Readable()
  }))
  expectAssignable<Duplex>(dispatcher.pipeline({ origin: '', path: '', method: 'GET', responseHeaders: null }, data => {
    expectAssignable<Dispatcher.PipelineHandlerData>(data)
    return new Readable()
  }))
  expectAssignable<Duplex>(dispatcher.pipeline({ origin: '', path: '', method: 'GET', opaque: { example: '' } }, data => {
    expectAssignable<Dispatcher.PipelineHandlerData<{ example: string }>>(data)
    expectType<{ example: string }>(data.opaque)
    return new Readable()
  }))

  // stream
  expectAssignable<Promise<Dispatcher.StreamData>>(dispatcher.stream({ origin: '', path: '', method: 'GET' }, data => {
    expectAssignable<Dispatcher.StreamFactoryData>(data)
    return new Writable()
  }))
  expectAssignable<Promise<Dispatcher.StreamData>>(dispatcher.stream({ origin: new URL('http://localhost'), path: '', method: 'GET' }, data => {
    expectAssignable<Dispatcher.StreamFactoryData>(data)
    return new Writable()
  }))
  expectAssignable<Promise<Dispatcher.StreamData<{ example: string }>>>(dispatcher.stream({ origin: '', path: '', method: 'GET', opaque: { example: '' } }, data => {
    expectType<{ example: string }>(data.opaque)
    return new Writable()
  }))
  expectAssignable<void>(dispatcher.stream(
    { origin: '', path: '', method: 'GET', reset: false },
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
  expectAssignable<void>(dispatcher.stream(
    { origin: new URL('http://localhost'), path: '', method: 'GET', opaque: { example: '' } },
    data => {
      expectAssignable<Dispatcher.StreamFactoryData<{ example: string }>>(data)
      return new Writable()
    },
    (err, data) => {
      expectAssignable<Error | null>(err)
      expectAssignable<Dispatcher.StreamData<{ example: string }>>(data)
      expectType<{ example: string }>(data.opaque)
    }
  ))
  expectAssignable<Promise<Dispatcher.StreamData>>(dispatcher.stream({ origin: '', path: '', method: 'GET', responseHeaders: 'raw' }, data => {
    expectAssignable<Dispatcher.StreamFactoryData>(data)
    return new Writable()
  }))
  expectAssignable<Promise<Dispatcher.StreamData>>(dispatcher.stream({ origin: '', path: '', method: 'GET', responseHeaders: null }, data => {
    expectAssignable<Dispatcher.StreamFactoryData>(data)
    return new Writable()
  }))

  // upgrade
  expectAssignable<Promise<Dispatcher.UpgradeData>>(dispatcher.upgrade({ path: '' }))
  expectAssignable<void>(dispatcher.upgrade({ path: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.UpgradeData>(data)
  }))
  expectAssignable<Promise<Dispatcher.UpgradeData>>(dispatcher.upgrade({ path: '', responseHeaders: 'raw' }))
  expectAssignable<Promise<Dispatcher.UpgradeData>>(dispatcher.upgrade({ path: '', responseHeaders: null }))
  expectAssignable<Promise<Dispatcher.UpgradeData>>(dispatcher.upgrade({ path: '', method: 'GET', headers: { authorization: undefined } }))
  expectAssignable<Promise<Dispatcher.UpgradeData>>(dispatcher.upgrade({ path: '', method: 'GET', headers: [] }))
  expectAssignable<Promise<Dispatcher.UpgradeData>>(dispatcher.upgrade({ path: '', method: 'GET', headers: ['hello', 'world'] }))
  expectAssignable<Promise<Dispatcher.UpgradeData>>(dispatcher.upgrade({ path: '', method: 'GET', headers: {} }))
  expectAssignable<Promise<Dispatcher.UpgradeData>>(dispatcher.upgrade({ path: '', method: 'GET', headers: nodeCoreHeaders }))
  expectAssignable<Promise<Dispatcher.UpgradeData>>(dispatcher.upgrade({ path: '', method: 'GET', headers: null }))
  expectAssignable<Promise<Dispatcher.UpgradeData>>(dispatcher.upgrade({ path: '', method: 'GET', headers: undefined }))
  expectAssignable<Promise<Dispatcher.UpgradeData>>(dispatcher.upgrade({ path: '', method: 'GET', headers: recordHeadersString }))
  expectAssignable<Promise<Dispatcher.UpgradeData>>(dispatcher.upgrade({ path: '', method: 'GET', headers: recordHeadersStringArray }))
  expectAssignable<Promise<Dispatcher.UpgradeData>>(dispatcher.upgrade({ path: '', method: 'GET', headers: recordHeadersUndefined }))
  expectAssignable<Promise<Dispatcher.UpgradeData>>(dispatcher.upgrade({ path: '', method: 'GET', headers: headerInstanceHeaders }))
  expectAssignable<Promise<Dispatcher.UpgradeData>>(dispatcher.upgrade({ path: '', method: 'GET', headers: mapHeaders }))
  expectAssignable<Promise<Dispatcher.UpgradeData>>(dispatcher.upgrade({ path: '', method: 'GET', headers: iteratorHeaders }))

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

declare const { body }: Dispatcher.ResponseData

// compose
expectAssignable<Dispatcher.ComposedDispatcher>(new Dispatcher().compose(
  (dispatcher) => {
    expectAssignable<Dispatcher['dispatch']>(dispatcher)
    return (opts, handlers) => {
      expectAssignable<Dispatcher.DispatchOptions>(opts)
      expectAssignable<Dispatcher.DispatchHandler>(handlers)
      return dispatcher(opts, handlers)
    }
  }
))
expectAssignable<Dispatcher.ComposedDispatcher>(new Dispatcher().compose([
  (dispatcher) => {
    expectAssignable<Dispatcher['dispatch']>(dispatcher)
    return (opts, handlers) => {
      expectAssignable<Dispatcher.DispatchOptions>(opts)
      expectAssignable<Dispatcher.DispatchHandler>(handlers)
      return dispatcher(opts, handlers)
    }
  },
  (dispatcher) => {
    expectAssignable<Dispatcher['dispatch']>(dispatcher)
    return (opts, handlers) => {
      expectAssignable<Dispatcher.DispatchOptions>(opts)
      expectAssignable<Dispatcher.DispatchHandler>(handlers)
      return dispatcher(opts, handlers)
    }
  }
]))

// body mixin tests
expectType<never | undefined>(body.body)
expectType<boolean>(body.bodyUsed)
expectType<Promise<ArrayBuffer>>(body.arrayBuffer())
expectType<Promise<Blob>>(body.blob())
expectType<Promise<never>>(body.formData())
expectType<Promise<string>>(body.text())
expectType<Promise<unknown>>(body.json())
