import { IncomingHttpHeaders } from 'http'
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

  // dispatch
  expectAssignable<boolean>(dispatcher.dispatch({ path: '', method: 'GET' }, {}))
  expectAssignable<boolean>(dispatcher.dispatch({ origin: '', path: '', method: 'GET' }, {}))
  expectAssignable<boolean>(dispatcher.dispatch({ origin: '', path: '', method: 'GET', headers: { authorization: undefined } }, {}))
  expectAssignable<boolean>(dispatcher.dispatch({ origin: '', path: '', method: 'GET', headers: [] }, {}))
  expectAssignable<boolean>(dispatcher.dispatch({ origin: '', path: '', method: 'GET', headers: {} }, {}))
  expectAssignable<boolean>(dispatcher.dispatch({ origin: '', path: '', method: 'GET', headers: nodeCoreHeaders }, {}))
  expectAssignable<boolean>(dispatcher.dispatch({ origin: '', path: '', method: 'GET', headers: null, reset: true }, {}))
  expectAssignable<boolean>(dispatcher.dispatch({ origin: '', path: '', method: 'GET', headers: headerInstanceHeaders, reset: true }, {}))
  expectAssignable<boolean>(dispatcher.dispatch({ origin: '', path: '', method: 'GET', headers: mapHeaders, reset: true }, {}))
  expectAssignable<boolean>(dispatcher.dispatch({ origin: '', path: '', method: 'GET', headers: iteratorHeaders, reset: true }, {}))
  expectAssignable<boolean>(dispatcher.dispatch({ origin: new URL('http://localhost'), path: '', method: 'GET' }, {}))
  expectAssignable<boolean>(dispatcher.dispatch({ path: '', method: 'CUSTOM' }, {}))

  // request
  expectAssignable<Promise<Dispatcher.ResponseData>>(dispatcher.request({ origin: '', path: '', method: 'GET', maxRedirections: 0 }))
  expectAssignable<Promise<Dispatcher.ResponseData>>(dispatcher.request({ origin: '', path: '', method: 'GET', maxRedirections: 0, query: {} }))
  expectAssignable<Promise<Dispatcher.ResponseData>>(dispatcher.request({ origin: '', path: '', method: 'GET', maxRedirections: 0, query: { pageNum: 1, id: 'abc' } }))
  expectAssignable<Promise<Dispatcher.ResponseData>>(dispatcher.request({ origin: '', path: '', method: 'GET', maxRedirections: 0, throwOnError: true }))
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
      expectAssignable<Dispatcher.DispatchHandlers>(handlers)
      return dispatcher(opts, handlers)
    }
  }
))
expectAssignable<Dispatcher.ComposedDispatcher>(new Dispatcher().compose([
  (dispatcher) => {
    expectAssignable<Dispatcher['dispatch']>(dispatcher)
    return (opts, handlers) => {
      expectAssignable<Dispatcher.DispatchOptions>(opts)
      expectAssignable<Dispatcher.DispatchHandlers>(handlers)
      return dispatcher(opts, handlers)
    }
  },
  (dispatcher) => {
    expectAssignable<Dispatcher['dispatch']>(dispatcher)
    return (opts, handlers) => {
      expectAssignable<Dispatcher.DispatchOptions>(opts)
      expectAssignable<Dispatcher.DispatchHandlers>(handlers)
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
