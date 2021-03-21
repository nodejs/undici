import Pool from './pool'
import Client from './client'
import MockAgent from './mock-agent'
import { MockInterceptor } from './mock-interceptor'

export = MockPool

/** MockPool extends the Pool API and allows one to mock requests. */
declare class MockPool extends Pool {
  constructor(origin: string, options: MockPool.Options);
  /** Intercepts any matching requests that use the same origin as this mock pool. */
  intercept(options: MockInterceptor.Options): MockInterceptor;
  /** This is a mock of the low level dispatch API. */
  dispatch(options: Client.DispatchOptions, handlers: Client.DispatchHandlers): void;
  /** Closes the mock pool and gracefully waits for enqueued requests to complete. */
  close(): Promise<void>;
}

declare namespace MockPool {
  /** MockPool options. */
  export interface Options extends Pool.Options {
    /** The MockAgent to be associated with this mock pool. */
    agent: MockAgent;
  }
}
