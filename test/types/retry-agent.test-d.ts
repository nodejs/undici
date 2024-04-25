import { expectAssignable } from 'tsd'
import { RetryAgent, Agent } from '../..'

const dispatcher = new Agent()

expectAssignable<RetryAgent>(new RetryAgent(dispatcher))
expectAssignable<RetryAgent>(new RetryAgent(dispatcher, { maxRetries: 5 }))

{
  const retryAgent = new RetryAgent(dispatcher)

  // close
  expectAssignable<Promise<void>>(retryAgent.close())

  // dispatch
  expectAssignable<boolean>(retryAgent.dispatch({ origin: '', path: '', method: 'GET' }, {}))
}
