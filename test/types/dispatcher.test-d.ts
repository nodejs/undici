import { IncomingHttpHeaders } from 'http'
import { Duplex, Readable, Writable } from 'stream'
import { expectAssignable, expectType } from 'tsd'
import { Dispatcher } from '../..'
import { URL } from 'url'
import { Blob } from 'buffer'

expectAssignable<Dispatcher>(new Dispatcher())

{
  const dispatcher = new Dispatcher()

  const nodeCoreHeaders = {
    authorization: undefined,
    ['content-type']: 'application/json'
  } satisfies IncomingHttpHeaders;

  const headerInstanceHeaders = new Headers({ hello: 'world' })
  const mapHeaders = new Map([['hello', 'world']])
  const iteratorHeaders = {
    *[Symbol.iterator]() {
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

  // connect
  expectAssignable<Promise<Dispatcher.ConnectData>>(dispatcher.connect({ origin: '', path: '', maxRedirections: 0 }))
  expectAssignable<Promise<Dispatcher.ConnectData>>(dispatcher.connect({ origin: new URL('http://localhost'), path: '', maxRedirections: 0 }))
  expectAssignable<void>(dispatcher.connect({ origin: '', path: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ConnectData>(data)
  }))
  expectAssignable<void>(dispatcher.connect({ origin: new URL('http://localhost'), path: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ConnectData>(data)
  }))

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

// compose
{
  expectAssignable<Dispatcher.ComposedDispatcher>(new Dispatcher().compose(
    (dispatcher) => {
      expectAssignable<Dispatcher['dispatch']>(dispatcher);
      return (opts, handlers) => {
        expectAssignable<Dispatcher.DispatchOptions>(opts);
        expectAssignable<Dispatcher.DispatchHandlers>(handlers);
        return dispatcher(opts, handlers)
      }
    }
  ))
  expectAssignable<Dispatcher.ComposedDispatcher>(new Dispatcher().compose([
    (dispatcher) => {
      expectAssignable<Dispatcher['dispatch']>(dispatcher);
      return (opts, handlers) => {
        expectAssignable<Dispatcher.DispatchOptions>(opts);
        expectAssignable<Dispatcher.DispatchHandlers>(handlers);
        return dispatcher(opts, handlers)
      }
    },
    (dispatcher) => {
      expectAssignable<Dispatcher['dispatch']>(dispatcher);
      return (opts, handlers) => {
        expectAssignable<Dispatcher.DispatchOptions>(opts);
        expectAssignable<Dispatcher.DispatchHandlers>(handlers);
        return dispatcher(opts, handlers)
      }
    }
  ]))
}

{
  // body mixin tests
  expectType<never | undefined>(body.body)
  expectType<boolean>(body.bodyUsed)
  expectType<Promise<ArrayBuffer>>(body.arrayBuffer())
  expectType<Promise<Blob>>(body.blob())
  expectType<Promise<never>>(body.formData())
  expectType<Promise<string>>(body.text())
  expectType<Promise<unknown>>(body.json())
}
