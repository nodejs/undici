import { Agent } from './agent'
import Pool from './pool'
import MockPool from './mock-pool'
import MockClient from './mock-client'

export = MockAgent

/** A mocked Agent class that implements the Agent API. It allows one to intercept HTTP requests made through undici and return mocked responses instead. */
declare class MockAgent {
  constructor(options?: MockAgent.Options)
  /** Creates and retrieves MockPool or MockClient instances which can then be used to intercept HTTP requests. If the number of connections on the mock agent is set to 1, a MockClient instance is returned. Otherwise a MockPool instance is returned. */
  get(origin: string): MockPool | MockClient;
  get(origin: RegExp): MockPool | MockClient;
  get(origin: ((origin: string) => boolean)): MockPool | MockClient;
  /** Closes the mock agent and waits for registered mock pools and clients to also close before resolving. */
  close(): Promise<void>;
  /** Disables mocking in MockAgent. */
  deactivate(): void;
  /** Enables mocking in a MockAgent instance. When instantiated, a MockAgent is automatically activated. Therefore, this method is only effective after `MockAgent.deactivate` has been called. */
  activate(): void;
  /** Define host matchers so only matching requests that aren't intercepted will be attempted. */
  enableNetConnect(): void;
  enableNetConnect(host: string): void;
  enableNetConnect(host: RegExp): void;
  enableNetConnect(host: ((host: string) => boolean)): void;
  /** Causes all requests to throw when requests are not matched in a MockAgent intercept. */
  disableNetConnect(): void;
}

declare namespace MockAgent {
  /** MockAgent options. */
  export interface Options extends Pool.Options {
    /** A custom agent to be encapsulated by the MockAgent. */
    agent?: Agent;
  }
}
