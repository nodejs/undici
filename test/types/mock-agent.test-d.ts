import { expectAssignable, expectType } from 'tsd'
import { Agent, Dispatcher, MockAgent, MockClient, MockPool, setGlobalDispatcher } from '../..'
import { MockInterceptor } from '../../types/mock-interceptor'
import ProxyAgent from '../../types/proxy-agent'
import EnvHttpProxyAgent from '../../types/env-http-proxy-agent'
import RetryAgent from '../../types/retry-agent'

import MockDispatch = MockInterceptor.MockDispatch

expectAssignable<MockAgent>(new MockAgent())
expectAssignable<MockAgent>(new MockAgent({}))

{
  const mockAgent = new MockAgent()
  expectAssignable<void>(setGlobalDispatcher(mockAgent))

  // get
  expectAssignable<MockPool>(mockAgent.get(''))
  // eslint-disable-next-line prefer-regex-literals
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
  // eslint-disable-next-line prefer-regex-literals
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

{
  interface PendingInterceptor extends MockDispatch {
    origin: string;
  }

  const agent = new MockAgent({ agent: new Agent() })
  expectType<() => PendingInterceptor[]>(agent.pendingInterceptors)
  expectType<(options?: {
    pendingInterceptorsFormatter?: {
      format(pendingInterceptors: readonly PendingInterceptor[]): string;
    }
  }) => void>(agent.assertNoPendingInterceptors)
}

// issue #3444
// ProxyAgent, EnvHttpProxyAgent, RetryAgent should be assignable to the agent
// option of MockAgent

expectType<MockAgent>(new MockAgent({
  agent: new ProxyAgent({
    uri: 'http://localhost:3000'
  })
}))
expectType<MockAgent>(new MockAgent({
  agent: new EnvHttpProxyAgent()
}))
expectType<MockAgent>(new MockAgent({
  agent: new RetryAgent(new Agent())
}))
