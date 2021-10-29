import { expectAssignable } from 'tsd'
import { MockAgent, MockClient } from '../..'
import { MockInterceptor } from '../../types/mock-interceptor'

{
  const mockClient: MockClient = new MockAgent({ connections: 1 }).get('')

  // intercept
  expectAssignable<MockInterceptor>(mockClient.intercept({ path: '', method: 'GET' }))
  expectAssignable<MockInterceptor>(mockClient.intercept({ path: '', method: 'GET', body: '', headers: { 'User-Agent': '' } }))
  expectAssignable<MockInterceptor>(mockClient.intercept({ path: new RegExp(''), method: new RegExp(''), body: new RegExp(''), headers: { 'User-Agent': new RegExp('') } }))
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
    },
    headers: {
      'User-Agent': (header) => {
        expectAssignable<string>(header)
        return true
      }
    }
  }))

  // dispatch
  expectAssignable<boolean>(mockClient.dispatch({ origin: '', path: '', method: 'GET' }, {}))

  // close
  expectAssignable<Promise<void>>(mockClient.close())
}

{
  expectAssignable<MockClient>(new MockClient('', {agent: new MockAgent({ connections: 1})}))
}
