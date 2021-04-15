import { expectAssignable } from 'tsd'
import { MockAgent, MockPool } from '../..'
import { MockInterceptor } from '../../types/mock-interceptor'

{
  const mockPool: MockPool = new MockAgent({ connections: 1 }).get('')

  // intercept
  expectAssignable<MockInterceptor>(mockPool.intercept({ path: '', method: '' }))
  expectAssignable<MockInterceptor>(mockPool.intercept({ path: '', method: '', body: '' }))
  expectAssignable<MockInterceptor>(mockPool.intercept({ path: new RegExp(''), method: new RegExp(''), body: new RegExp('') }))
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
    }
  }))

  // dispatch
  expectAssignable<void>(mockPool.dispatch({ origin: '', path: '', method: '' }, {}))

  // close
  expectAssignable<Promise<void>>(mockPool.close())
}

{
  expectAssignable<MockPool>(new MockPool('', {agent: new MockAgent({ connections: 1})}))
}
