import Dispatcher from './dispatcher'

declare namespace MockCallHistoryLog {
  /** request's configuration properties */
  export type MockCallHistoryLogProperties = 'protocol' | 'host' | 'port' | 'origin' | 'path' | 'hash' | 'fullUrl' | 'method' | 'searchParams' | 'body' | 'headers'
}

/** a log reflecting request configuration  */
declare class MockCallHistoryLog {
  constructor (requestInit: Dispatcher.DispatchOptions)
  /** protocol used. */
  protocol: string
  /** request's host. ie. 'https:' or 'http:' etc... */
  host: string
  /** request's port. */
  port: string
  /** request's origin. ie. https://localhost:3000. */
  origin: string
  /** path. never contains searchParams. */
  path: string
  /** request's hash. */
  hash: string
  /** the full url requested. */
  fullUrl: string
  /** request's method. */
  method: Dispatcher.DispatchOptions['method']
  /** search params. */
  searchParams: Record<string, string>
  /** request's body */
  body: Dispatcher.DispatchOptions['body']
  /** request's headers */
  headers: Dispatcher.DispatchOptions['headers']

  /** returns an Map of property / value pair */
  toMap (): Map<MockCallHistoryLog.MockCallHistoryLogProperties, string | Dispatcher.DispatchOptions['headers'] | Dispatcher.DispatchOptions['body'] | Dispatcher.DispatchOptions['method']>

  /** returns a string computed with all key value pair */
  toString (): string
}

declare namespace MockCallHistory {
  /** a function to be executed for filtering MockCallHistoryLog */
  export type FilterCallsFunctionCriteria = (log: MockCallHistoryLog) => boolean

  /** parameter to filter MockCallHistoryLog */
  export type FilterCallsParameter = string | RegExp | undefined | null

  /** an object to execute multiple filtering at once */
  export interface FilterCallsObjectCriteria extends Record<string, FilterCallsParameter> {
    protocol?: FilterCallsParameter;
    host?: FilterCallsParameter;
    port?: FilterCallsParameter;
    origin?: FilterCallsParameter;
    path?: FilterCallsParameter;
    hash?: FilterCallsParameter;
    fullUrl?: FilterCallsParameter;
    method?: FilterCallsParameter;
  }
}

/** a call history to track requests configuration */
declare class MockCallHistory {
  constructor (name: string)
  /** returns an array of MockCallHistoryLog. */
  calls (): Array<MockCallHistoryLog>
  /** returns the first MockCallHistoryLog */
  firstCall (): MockCallHistoryLog | undefined
  /** returns the last MockCallHistoryLog. */
  lastCall (): MockCallHistoryLog | undefined
  /** returns the nth MockCallHistoryLog. */
  nthCall (position: number): MockCallHistoryLog | undefined
  /** return all MockCallHistoryLog matching any of criteria given. */
  filterCalls (criteria: MockCallHistory.FilterCallsObjectCriteria | MockCallHistory.FilterCallsFunctionCriteria | RegExp): Array<MockCallHistoryLog>
  /** return all MockCallHistoryLog matching the given protocol. if a string is given, it is matched with includes */
  filterCallsByProtocol (protocol: MockCallHistory.FilterCallsParameter): Array<MockCallHistoryLog>
  /** return all MockCallHistoryLog matching the given host. if a string is given, it is matched with includes */
  filterCallsByHost (host: MockCallHistory.FilterCallsParameter): Array<MockCallHistoryLog>
  /** return all MockCallHistoryLog matching the given port. if a string is given, it is matched with includes */
  filterCallsByPort (port: MockCallHistory.FilterCallsParameter): Array<MockCallHistoryLog>
  /** return all MockCallHistoryLog matching the given origin. if a string is given, it is matched with includes */
  filterCallsByOrigin (origin: MockCallHistory.FilterCallsParameter): Array<MockCallHistoryLog>
  /** return all MockCallHistoryLog matching the given path. if a string is given, it is matched with includes */
  filterCallsByPath (path: MockCallHistory.FilterCallsParameter): Array<MockCallHistoryLog>
  /** return all MockCallHistoryLog matching the given hash. if a string is given, it is matched with includes */
  filterCallsByHash (hash: MockCallHistory.FilterCallsParameter): Array<MockCallHistoryLog>
  /** return all MockCallHistoryLog matching the given fullUrl. if a string is given, it is matched with includes */
  filterCallsByFullUrl (fullUrl: MockCallHistory.FilterCallsParameter): Array<MockCallHistoryLog>
  /** return all MockCallHistoryLog matching the given method. if a string is given, it is matched with includes */
  filterCallsByMethod (method: MockCallHistory.FilterCallsParameter): Array<MockCallHistoryLog>
  /** clear all MockCallHistoryLog on this MockCallHistory. */
  clear (): void
}

export { MockCallHistoryLog, MockCallHistory }
