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
