import { expectAssignable } from 'tsd'
import { MockAgent, MockPool } from '../..'
import { MockInterceptor } from '../../types/mock-interceptor'

{
  const mockPool: MockPool = new MockAgent({ connections: 1 }).get('')

  // intercept
  expectAssignable<MockInterceptor>(mockPool.intercept({ path: '', method: 'GET' }))
  expectAssignable<MockInterceptor>(mockPool.intercept({ path: '', method: 'GET', body: '', headers: { 'User-Agent': '' } }))
  expectAssignable<MockInterceptor>(mockPool.intercept({ path: new RegExp(''), method: new RegExp(''), body: new RegExp(''), headers: { 'User-Agent': new RegExp('') } }))
  expectAssignable<MockInterceptor>(mockPool.intercept({
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
  expectAssignable<void>(mockPool.dispatch({ origin: '', path: '', method: 'GET' }, {}))

  // close
  expectAssignable<Promise<void>>(mockPool.close())
}

{
  expectAssignable<MockPool>(new MockPool('', {agent: new MockAgent({ connections: 1})}))
}
