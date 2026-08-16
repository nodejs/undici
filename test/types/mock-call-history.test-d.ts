import { expectType } from 'tsd'
import { MockAgent, MockCallHistory, MockCallHistoryLog } from '../..'

{
  const mockAgent = new MockAgent()
  expectType<MockCallHistory | undefined>(mockAgent.getCallHistory())
  expectType<void>(mockAgent.clearCallHistory())
  expectType<MockAgent>(mockAgent.enableCallHistory())
  expectType<MockAgent>(mockAgent.disableCallHistory())
}

{
  const mockAgent = new MockAgent({ enableCallHistory: true })
  expectType<MockCallHistoryLog | undefined>(mockAgent.getCallHistory()?.firstCall())
  expectType<MockCallHistoryLog | undefined>(mockAgent.getCallHistory()?.lastCall())
  expectType<MockCallHistoryLog | undefined>(mockAgent.getCallHistory()?.nthCall(1))
  expectType<Array<MockCallHistoryLog> | undefined>(mockAgent.getCallHistory()?.calls())
  expectType<Array<MockCallHistoryLog> | undefined>(mockAgent.getCallHistory()?.filterCallsByFullUrl(''))
  expectType<Array<MockCallHistoryLog> | undefined>(mockAgent.getCallHistory()?.filterCallsByHash(''))
  expectType<Array<MockCallHistoryLog> | undefined>(mockAgent.getCallHistory()?.filterCallsByHost(''))
  expectType<Array<MockCallHistoryLog> | undefined>(mockAgent.getCallHistory()?.filterCallsByMethod(''))
  expectType<Array<MockCallHistoryLog> | undefined>(mockAgent.getCallHistory()?.filterCallsByOrigin(''))
  expectType<Array<MockCallHistoryLog> | undefined>(mockAgent.getCallHistory()?.filterCallsByPath(''))
  expectType<Array<MockCallHistoryLog> | undefined>(mockAgent.getCallHistory()?.filterCallsByPort(''))
  expectType<Array<MockCallHistoryLog> | undefined>(mockAgent.getCallHistory()?.filterCallsByProtocol(''))
  expectType<Array<MockCallHistoryLog> | undefined>(mockAgent.getCallHistory()?.filterCalls((log) => log.path === '/'))
  expectType<Array<MockCallHistoryLog> | undefined>(mockAgent.getCallHistory()?.filterCalls(/path->\//))
  expectType<Array<MockCallHistoryLog> | undefined>(mockAgent.getCallHistory()?.filterCalls({ method: 'POST' }))
  expectType<Array<MockCallHistoryLog> | undefined>(mockAgent.getCallHistory()?.filterCalls({ method: 'POST' }, { operator: 'AND' }))

  const callHistory = mockAgent.getCallHistory()

  if (callHistory !== undefined) {
    expectType<Array<MockCallHistoryLog>>([...callHistory])
    expectType<Set<MockCallHistoryLog>>(new Set(callHistory))

    for (const log of callHistory) {
      expectType<MockCallHistoryLog>(log)
      expectType<string | null | undefined>(log.body)
      expectType<string>(log.fullUrl)
      expectType<string>(log.hash)
      expectType<Record<string, string | Array<string>> | null | undefined>(log.headers)
      expectType<string>(log.host)
      expectType<string>(log.method)
      expectType<string>(log.origin)
      expectType<string>(log.path)
      expectType<string>(log.port)
      expectType<string>(log.protocol)
      expectType<Record<string, string>>(log.searchParams)
      expectType<Map<MockCallHistoryLog.MockCallHistoryLogProperties, string | Record<string, string | string[]> | null | undefined>>(log.toMap())
      expectType<string>(log.toString())
    }
  }
  expectType<void | undefined>(mockAgent.getCallHistory()?.clear())
}
