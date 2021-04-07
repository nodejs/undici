import { Duplex, Readable, Writable } from 'stream'
import { expectAssignable } from 'tsd'
import { Agent, Dispatcher } from '../..'
import { URL } from 'url'

expectAssignable<Agent>(new Agent())
expectAssignable<Agent>(new Agent({}))
expectAssignable<Agent>(new Agent({ maxRedirections: 1 }))
expectAssignable<Agent>(new Agent({ factory: () => new Dispatcher() }))

{
  const agent = new Agent()

  // properties
  expectAssignable<boolean>(agent.closed)
  expectAssignable<boolean>(agent.destroyed)

  // request
  expectAssignable<PromiseLike<Dispatcher.ResponseData>>(agent.request({ origin: '', path: '', method: '' }))
  expectAssignable<PromiseLike<Dispatcher.ResponseData>>(agent.request({ origin: new URL('http://localhost'), path: '', method: '' }))
  expectAssignable<void>(agent.request({ origin: '', path: '', method: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ResponseData>(data)
  }))
  expectAssignable<void>(agent.request({ origin: new URL('http://localhost'), path: '', method: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ResponseData>(data)
  }))

  // stream
  expectAssignable<PromiseLike<Dispatcher.StreamData>>(agent.stream({ origin: '', path: '', method: '' }, data => {
    expectAssignable<Dispatcher.StreamFactoryData>(data)
    return new Writable()
  }))
  expectAssignable<PromiseLike<Dispatcher.StreamData>>(agent.stream({ origin: new URL('http://localhost'), path: '', method: '' }, data => {
    expectAssignable<Dispatcher.StreamFactoryData>(data)
    return new Writable()
  }))
  expectAssignable<void>(agent.stream(
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
  expectAssignable<void>(agent.stream(
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
  expectAssignable<Duplex>(agent.pipeline({ origin: '', path: '', method: '' }, data => {
    expectAssignable<Dispatcher.PipelineHandlerData>(data)
    return new Readable()
  }))
  expectAssignable<Duplex>(agent.pipeline({ origin: new URL('http://localhost'), path: '', method: '' }, data => {
    expectAssignable<Dispatcher.PipelineHandlerData>(data)
    return new Readable()
  }))

  // upgrade
  expectAssignable<PromiseLike<Dispatcher.UpgradeData>>(agent.upgrade({ path: '' }))
  expectAssignable<void>(agent.upgrade({ path: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.UpgradeData>(data)
  }))

  // connect
  expectAssignable<PromiseLike<Dispatcher.ConnectData>>(agent.connect({ path: '' }))
  expectAssignable<void>(agent.connect({ path: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ConnectData>(data)
  }))

  // dispatch
  expectAssignable<void>(agent.dispatch({ origin: '', path: '', method: '' }, {}))
  expectAssignable<void>(agent.dispatch({ origin: '', path: '', method: '', maxRedirections: 1 }, {}))

  // close
  expectAssignable<PromiseLike<void>>(agent.close())
  expectAssignable<void>(agent.close(() => {}))

  // destroy
  expectAssignable<PromiseLike<void>>(agent.destroy())
  expectAssignable<PromiseLike<void>>(agent.destroy(new Error()))
  expectAssignable<PromiseLike<void>>(agent.destroy(null))
  expectAssignable<void>(agent.destroy(() => {}))
  expectAssignable<void>(agent.destroy(new Error(), () => {}))
  expectAssignable<void>(agent.destroy(null, () => {}))
}
