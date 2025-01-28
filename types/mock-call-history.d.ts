import Dispatcher from './dispatcher'

type MockCallHistoryLogProperties = 'protocol' | 'host' | 'port' | 'origin' | 'path' | 'hash' | 'fullUrl' | 'method' | 'searchParams' | 'body' | 'headers'

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
  toMap (): Map<MockCallHistoryLogProperties, string | Dispatcher.DispatchOptions['headers'] | Dispatcher.DispatchOptions['body'] | Dispatcher.DispatchOptions['method']>

  /** returns a string computed with all key value pair */
  toString (): string
}

interface FilterCallsObjectCriteria extends Record<string, FilterCallsParameter> {
  protocol?: FilterCallsParameter;
  host?: FilterCallsParameter;
  port?: FilterCallsParameter;
  origin?: FilterCallsParameter;
  path?: FilterCallsParameter;
  hash?: FilterCallsParameter;
  fullUrl?: FilterCallsParameter;
  method?: FilterCallsParameter;
}

type FilterCallFunctionCriteria = (log: MockCallHistoryLog) => boolean

type FilterCallsParameter = string | RegExp | undefined | null

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
  filterCalls (criteria: FilterCallsObjectCriteria | FilterCallFunctionCriteria | RegExp): Array<MockCallHistoryLog>
  /** return all MockCallHistoryLog matching the given protocol. if a string is given, it is matched with includes */
  filterCallsByProtocol (protocol: FilterCallsParameter): Array<MockCallHistoryLog>
  /** return all MockCallHistoryLog matching the given host. if a string is given, it is matched with includes */
  filterCallsByHost (host: FilterCallsParameter): Array<MockCallHistoryLog>
  /** return all MockCallHistoryLog matching the given port. if a string is given, it is matched with includes */
  filterCallsByPort (port: FilterCallsParameter): Array<MockCallHistoryLog>
  /** return all MockCallHistoryLog matching the given origin. if a string is given, it is matched with includes */
  filterCallsByOrigin (origin: FilterCallsParameter): Array<MockCallHistoryLog>
  /** return all MockCallHistoryLog matching the given path. if a string is given, it is matched with includes */
  filterCallsByPath (path: FilterCallsParameter): Array<MockCallHistoryLog>
  /** return all MockCallHistoryLog matching the given hash. if a string is given, it is matched with includes */
  filterCallsByHash (hash: FilterCallsParameter): Array<MockCallHistoryLog>
  /** return all MockCallHistoryLog matching the given fullUrl. if a string is given, it is matched with includes */
  filterCallsByFullUrl (fullUrl: FilterCallsParameter): Array<MockCallHistoryLog>
  /** return all MockCallHistoryLog matching the given method. if a string is given, it is matched with includes */
  filterCallsByMethod (method: FilterCallsParameter): Array<MockCallHistoryLog>
  /** clear all MockCallHistoryLog on this MockCallHistory. */
  clear (): void
}

export { MockCallHistoryLog, MockCallHistory, FilterCallsObjectCriteria, FilterCallFunctionCriteria, FilterCallsParameter, MockCallHistoryLogProperties }
