import { Duplex, Readable, Writable } from 'stream'
import { expectAssignable } from 'tsd'
import { EnvHttpProxyAgent, setGlobalDispatcher, getGlobalDispatcher, Dispatcher } from '../..'

expectAssignable<EnvHttpProxyAgent>(new EnvHttpProxyAgent())
expectAssignable<EnvHttpProxyAgent>(new EnvHttpProxyAgent({ httpProxy: 'http://localhost:8080', httpsProxy: 'http://localhost:8443', noProxy: 'localhost' }))

{
  const agent = new EnvHttpProxyAgent()
  expectAssignable<void>(setGlobalDispatcher(agent))
  expectAssignable<EnvHttpProxyAgent>(getGlobalDispatcher())

  // request
  expectAssignable<Promise<Dispatcher.ResponseData>>(agent.request({ origin: '', path: '', method: 'GET' }))
  expectAssignable<Promise<Dispatcher.ResponseData>>(agent.request({ origin: '', path: '', method: 'GET', onInfo: (info) => {} }))
  expectAssignable<Promise<Dispatcher.ResponseData>>(agent.request({ origin: new URL('http://localhost'), path: '', method: 'GET' }))
  expectAssignable<void>(agent.request({ origin: '', path: '', method: 'GET' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ResponseData>(data)
  }))
  expectAssignable<void>(agent.request({ origin: new URL('http://localhost'), path: '', method: 'GET' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ResponseData>(data)
  }))

  // stream
  expectAssignable<Promise<Dispatcher.StreamData>>(agent.stream({ origin: '', path: '', method: 'GET' }, data => {
    expectAssignable<Dispatcher.StreamFactoryData>(data)
    return new Writable()
  }))
  expectAssignable<Promise<Dispatcher.StreamData>>(agent.stream({ origin: '', path: '', method: 'GET', onInfo: (info) => {} }, data => {
    expectAssignable<Dispatcher.StreamFactoryData>(data)
    return new Writable()
  }))
  expectAssignable<Promise<Dispatcher.StreamData>>(agent.stream({ origin: new URL('http://localhost'), path: '', method: 'GET' }, data => {
    expectAssignable<Dispatcher.StreamFactoryData>(data)
    return new Writable()
  }))
  expectAssignable<void>(agent.stream(
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
  expectAssignable<void>(agent.stream(
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

  // pipeline
  expectAssignable<Duplex>(agent.pipeline({ origin: '', path: '', method: 'GET' }, data => {
    expectAssignable<Dispatcher.PipelineHandlerData>(data)
    return new Readable()
  }))
  expectAssignable<Duplex>(agent.pipeline({ origin: '', path: '', method: 'GET', onInfo: (info) => {} }, data => {
    expectAssignable<Dispatcher.PipelineHandlerData>(data)
    return new Readable()
  }))
  expectAssignable<Duplex>(agent.pipeline({ origin: new URL('http://localhost'), path: '', method: 'GET' }, data => {
    expectAssignable<Dispatcher.PipelineHandlerData>(data)
    return new Readable()
  }))

  // upgrade
  expectAssignable<Promise<Dispatcher.UpgradeData>>(agent.upgrade({ path: '' }))
  expectAssignable<void>(agent.upgrade({ path: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.UpgradeData>(data)
  }))

  // connect
  expectAssignable<Promise<Dispatcher.ConnectData>>(agent.connect({ origin: '', path: '' }))
  expectAssignable<Promise<Dispatcher.ConnectData>>(agent.connect({ origin: new URL('http://localhost'), path: '' }))
  expectAssignable<void>(agent.connect({ origin: '', path: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ConnectData>(data)
  }))
  expectAssignable<void>(agent.connect({ origin: new URL('http://localhost'), path: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ConnectData>(data)
  }))

  // dispatch
  expectAssignable<boolean>(agent.dispatch({ origin: '', path: '', method: 'GET' }, {}))
  expectAssignable<boolean>(agent.dispatch({ origin: '', path: '', method: 'GET', maxRedirections: 1 }, {}))

  // close
  expectAssignable<Promise<void>>(agent.close())
  expectAssignable<void>(agent.close(() => {}))

  // destroy
  expectAssignable<Promise<void>>(agent.destroy())
  expectAssignable<Promise<void>>(agent.destroy(new Error()))
  expectAssignable<Promise<void>>(agent.destroy(null))
  expectAssignable<void>(agent.destroy(() => {}))
  expectAssignable<void>(agent.destroy(new Error(), () => {}))
  expectAssignable<void>(agent.destroy(null, () => {}))
}
