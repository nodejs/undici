import { expectType } from 'tsd'
import { Dispatcher, interceptors, MockCallHistory, MockCallHistoryLog, request } from '../../'
import { kMockCallHistoryAddLog, kMockCallHistoryDeleteAll } from '../../lib/mock/mock-symbols'

async function exampleCode () {
  const retry = interceptors.retry()
  const rd = interceptors.redirect()
  const dump = interceptors.dump()

  expectType<Dispatcher.DispatcherComposeInterceptor>(retry)
  expectType<Dispatcher.DispatcherComposeInterceptor>(rd)
  expectType<Dispatcher.DispatcherComposeInterceptor>(dump)

  await request('http://localhost:3000/foo')
}

function checkMockCallHistoryIterator () {
  const mockCallHistory = new MockCallHistory('hello')
  // @ts-ignore -- not relevant here
  mockCallHistory[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:4000', method: 'GET' })
  // @ts-ignore -- not relevant here
  mockCallHistory[kMockCallHistoryAddLog]({ path: '/endpoint', origin: 'http://localhost:4000', method: 'GET' })

  expectType<Array<MockCallHistoryLog>>([...mockCallHistory])

  for (const log of mockCallHistory) {
    expectType<MockCallHistoryLog>(log)
  }

  // @ts-ignore -- not relevant here
  MockCallHistory[kMockCallHistoryDeleteAll]()
}

exampleCode()
checkMockCallHistoryIterator()
