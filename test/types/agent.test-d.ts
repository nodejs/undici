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
  expectAssignable<Promise<Dispatcher.ResponseData>>(agent.request({ origin: '', path: '', method: 'GET' }))
  expectAssignable<Promise<Dispatcher.ResponseData>>(agent.request({ origin: new URL('http://localhost'), path: '', method: 'GET' }))
  expectAssignable<void>(agent.request({ origin: '', path: '', method: 'GET' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ResponseData>(data)
  }))
  expectAssignable<void>(agent.request({ origin: new URL('http://localhost'), path: '', method: 'GET' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ResponseData>(data)
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
