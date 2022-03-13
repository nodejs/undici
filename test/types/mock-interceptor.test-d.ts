import { expectAssignable } from 'tsd'
import { MockAgent, MockPool } from '../..'
import { MockInterceptor, MockScope } from '../../types/mock-interceptor'

{
  const mockPool: MockPool = new MockAgent().get('')
  const mockInterceptor = mockPool.intercept({ path: '', method: 'GET' })

  // reply
  expectAssignable<MockScope>(mockInterceptor.reply(200, ''))
  expectAssignable<MockScope>(mockInterceptor.reply(200, Buffer))
  expectAssignable<MockScope>(mockInterceptor.reply(200, {}))
  expectAssignable<MockScope>(mockInterceptor.reply(200, () => ({})))
  expectAssignable<MockScope>(mockInterceptor.reply(200, {}, {}))
  expectAssignable<MockScope>(mockInterceptor.reply(200, () => ({}), {}))
  expectAssignable<MockScope>(mockInterceptor.reply(200, {}, { headers: { foo: 'bar' }}))
  expectAssignable<MockScope>(mockInterceptor.reply(200, () => ({}), { headers: { foo: 'bar' }}))
  expectAssignable<MockScope>(mockInterceptor.reply(200, {}, { trailers: { foo: 'bar' }}))
  expectAssignable<MockScope>(mockInterceptor.reply(200, () => ({}), { trailers: { foo: 'bar' }}))
  expectAssignable<MockScope<{ foo: string }>>(mockInterceptor.reply<{ foo: string }>(200, { foo: 'bar' }))
  expectAssignable<MockScope<{ foo: string }>>(mockInterceptor.reply<{ foo: string }>(200, () => ({ foo: 'bar' })))
  expectAssignable<MockScope>(mockInterceptor.reply(() => ({ statusCode: 200, data: { foo: 'bar' }})))
  expectAssignable<MockScope>(mockInterceptor.reply(() => ({ statusCode: 200, data: { foo: 'bar' }, responseOptions: {
    headers: { foo: 'bar' }
  }})))
  expectAssignable<MockScope>(mockInterceptor.reply((options) => { 
    expectAssignable<MockInterceptor.MockResponseCallbackOptions>(options);
    return { statusCode: 200, data: { foo: 'bar'}
  }}))
  expectAssignable<MockScope>(mockInterceptor.reply(() => ({ statusCode: 200, data: { foo: 'bar' }, responseOptions: {
    trailers: { foo: 'bar' }
  }})))

  // replyWithError
  class CustomError extends Error {
    hello(): void {}
  }
  expectAssignable<MockScope>(mockInterceptor.replyWithError(new Error('')))
  expectAssignable<MockScope>(mockInterceptor.replyWithError<CustomError>(new CustomError('')))

  // defaultReplyHeaders
  expectAssignable<MockInterceptor>(mockInterceptor.defaultReplyHeaders({ foo: 'bar' }))
  
  // defaultReplyTrailers
  expectAssignable<MockInterceptor>(mockInterceptor.defaultReplyTrailers({ foo: 'bar' }))

  // replyContentLength
  expectAssignable<MockInterceptor>(mockInterceptor.replyContentLength())
}

{
  const mockPool: MockPool = new MockAgent().get('')
  const mockScope = mockPool.intercept({ path: '', method: 'GET' }).reply(200, '')

  // delay
  expectAssignable<MockScope>(mockScope.delay(1))

  // persist
  expectAssignable<MockScope>(mockScope.persist())

  // times
  expectAssignable<MockScope>(mockScope.times(2))
}

{
  const mockPool: MockPool = new MockAgent().get('')
  mockPool.intercept({ path: '', method: 'GET', headers: () => true })
  mockPool.intercept({ path: '', method: 'GET', headers: () => false })
  mockPool.intercept({ path: '', method: 'GET', headers: (headers) => Object.keys(headers).includes('authorization') })
}
