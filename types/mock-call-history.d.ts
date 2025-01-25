import Dispatcher from './dispatcher'

declare class MockHistoryLog {
  constructor (requestInit: Dispatcher.DispatchOptions)
  body: Dispatcher.DispatchOptions['body'] | undefined
  headers: Dispatcher.DispatchOptions['headers'] | undefined
  origin: Dispatcher.DispatchOptions['origin'] | undefined
  method: Dispatcher.DispatchOptions['method'] | undefined
  path: Dispatcher.DispatchOptions['path'] | undefined
  query: Dispatcher.DispatchOptions['query'] | undefined
}

declare class MockCallHistory {
  constructor (name: string)

  static GetByName (name: string): MockCallHistory | undefined

  calls (): Array<MockHistoryLog>
  lastCall (): MockHistoryLog | undefined
  nthCall (position: number): MockHistoryLog | undefined
  clear (): void
}

export { MockHistoryLog, MockCallHistory }
