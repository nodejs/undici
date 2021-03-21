import Client from './client'
import MockAgent from './mock-agent'
import { MockInterceptor } from './mock-interceptor'

export = MockClient

/** MockClient extends the Client API and allows one to mock requests. */
declare class MockClient extends Client {
  constructor(origin: string, options: MockClient.Options);
  /** Intercepts any matching requests that use the same origin as this mock client. */
  intercept(options: MockInterceptor.Options): MockInterceptor;
  /** This is a mock of the low level dispatch API. */
  dispatch(options: Client.DispatchOptions, handlers: Client.DispatchHandlers): void;
  /** Closes the mock client and gracefully waits for enqueued requests to complete. */
  close(): Promise<void>;
}

declare namespace MockClient {
  /** MockClient options. */
  export interface Options extends Client.Options {
    /** The MockAgent to be associated with this mock client. */
    agent: MockAgent;
  }
}
