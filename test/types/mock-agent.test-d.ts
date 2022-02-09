import { expectAssignable } from 'tsd'
import { MockAgent, MockPool, MockClient, Agent, setGlobalDispatcher, Dispatcher } from '../..'
import { MockInterceptor } from '../../types/mock-interceptor'

expectAssignable<MockAgent>(new MockAgent())
expectAssignable<MockAgent>(new MockAgent({}))

{
  const mockAgent = new MockAgent()
  expectAssignable<void>(setGlobalDispatcher(mockAgent))

  // get
  expectAssignable<MockPool>(mockAgent.get(''))
  expectAssignable<MockPool>(mockAgent.get(new RegExp('')))
  expectAssignable<MockPool>(mockAgent.get((origin) => {
    expectAssignable<string>(origin)
    return true
  }))
  expectAssignable<Dispatcher>(mockAgent.get(''))

  // close
  expectAssignable<Promise<void>>(mockAgent.close())

  // deactivate
  expectAssignable<void>(mockAgent.deactivate())

  // activate
  expectAssignable<void>(mockAgent.activate())

  // enableNetConnect
  expectAssignable<void>(mockAgent.enableNetConnect())
  expectAssignable<void>(mockAgent.enableNetConnect(''))
  expectAssignable<void>(mockAgent.enableNetConnect(new RegExp('')))
  expectAssignable<void>(mockAgent.enableNetConnect((host) => {
    expectAssignable<string>(host)
    return true
  }))

  // disableNetConnect
  expectAssignable<void>(mockAgent.disableNetConnect())

  // dispatch
  expectAssignable<boolean>(mockAgent.dispatch({ origin: '', path: '', method: 'GET' }, {}))

  // intercept
  expectAssignable<MockInterceptor>((mockAgent.get('foo')).intercept({ path: '', method: 'GET' }))
}

{
  const mockAgent = new MockAgent({ connections: 1 })
  expectAssignable<void>(setGlobalDispatcher(mockAgent))
  expectAssignable<MockClient>(mockAgent.get(''))
}

{
  const agent = new Agent()
  const mockAgent = new MockAgent({ agent })
  expectAssignable<void>(setGlobalDispatcher(mockAgent))
  expectAssignable<MockPool>(mockAgent.get(''))
}
