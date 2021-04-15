import { expectAssignable } from 'tsd'
import { MockAgent, MockClient } from '../..'
import { MockInterceptor } from '../../types/mock-interceptor'

{
  const mockClient: MockClient = new MockAgent({ connections: 1 }).get('')

  // intercept
  expectAssignable<MockInterceptor>(mockClient.intercept({ path: '', method: '' }))
  expectAssignable<MockInterceptor>(mockClient.intercept({ path: '', method: '', body: '' }))
  expectAssignable<MockInterceptor>(mockClient.intercept({ path: new RegExp(''), method: new RegExp(''), body: new RegExp('') }))
  expectAssignable<MockInterceptor>(mockClient.intercept({
    path: (path) => {
      expectAssignable<string>(path)
      return true
    },
    method: (method) => {
      expectAssignable<string>(method)
      return true
    },
    body: (body) => {
      expectAssignable<string>(body)
      return true
    }
  }))

  // dispatch
  expectAssignable<void>(mockClient.dispatch({ origin: '', path: '', method: '' }, {}))

  // close
  expectAssignable<Promise<void>>(mockClient.close())
}

{
  expectAssignable<MockClient>(new MockClient('', {agent: new MockAgent({ connections: 1})}))
}
