import { expectAssignable } from 'tsd'
import { MockAgent, MockPool, MockClient, Agent, setGlobalAgent } from '../..'

expectAssignable<MockAgent>(new MockAgent())
expectAssignable<MockAgent>(new MockAgent({}))

{
  const mockAgent = new MockAgent()
  expectAssignable<void>(setGlobalAgent(mockAgent))

  // get
  expectAssignable<MockPool>(mockAgent.get(''))
  expectAssignable<MockPool>(mockAgent.get(new RegExp('')))
  expectAssignable<MockPool>(mockAgent.get((origin: string) => origin === ''))

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
  expectAssignable<void>(mockAgent.enableNetConnect((host: string) => host === ''))

  // disableNetConnect
  expectAssignable<void>(mockAgent.disableNetConnect())
}

{
  const mockAgent = new MockAgent({ connections: 1 })
  expectAssignable<void>(setGlobalAgent(mockAgent))
  expectAssignable<MockClient>(mockAgent.get(''))
}

{
  const agent = new Agent()
  const mockAgent = new MockAgent({ agent })
  expectAssignable<void>(setGlobalAgent(mockAgent))
}
