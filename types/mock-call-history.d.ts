import Dispatcher from './dispatcher'

declare class MockCallHistoryLog {
  constructor (requestInit: Dispatcher.DispatchOptions)
  /** request's body */
  body: Dispatcher.DispatchOptions['body']
  /** request's headers */
  headers: Dispatcher.DispatchOptions['headers']
  /** request's origin. ie. https://localhost:3000. */
  origin: string
  /** request's method. */
  method: Dispatcher.DispatchOptions['method']
  /** the full url requested. */
  fullUrl: string
  /** path. never contains searchParams. */
  path: string
  /** search params. */
  searchParams: Record<string, string>
  /** protocol used. */
  protocol: string
  /** request's host. ie. 'https:' or 'http:' etc... */
  host: string
  /** request's port. */
  port: string
}

declare class MockCallHistory {
  constructor (name: string)
  /** returns an array of MockCallHistoryLog. */
  calls (): Array<MockCallHistoryLog>
  /** returns the last MockCallHistoryLog. */
  lastCall (): MockCallHistoryLog | undefined
  /** returns the nth MockCallHistoryLog. */
  nthCall (position: number): MockCallHistoryLog | undefined
  /** clear all MockCallHistoryLog on this MockCallHistory. */
  clear (): void
}

export { MockCallHistoryLog, MockCallHistory }
